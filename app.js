/**
 * app.js
 * Main controller. Wires UI, Storage, and Downloader together.
 */

(function () {
  'use strict';

  /* ── STATE ──────────────────────────────────────────── */
  let currentPreview = null; // { rows, issuer, downloadUrl, ticker }
  let editingTicker  = null; // for modal edit mode

  /* ── DOM REFS ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  const tabBtns      = document.querySelectorAll('.tab-btn');
  const tabPanels    = document.querySelectorAll('.tab-panel');

  // Download tab
  const inputTicker  = $('etf-ticker');
  const inputUrl     = $('etf-url');
  const selectIssuer = $('issuer-hint');
  const btnDetect    = $('btn-detect');
  const btnManual    = $('btn-manual');
  const statusBox    = $('detect-status');
  const previewCard  = $('preview-card');
  const previewTicker  = $('preview-ticker');
  const previewMeta    = $('preview-meta');
  const previewTableWrap = $('preview-table-wrap');
  const btnSaveHistory = $('btn-save-history');
  const btnExportCSV   = $('btn-export-csv');
  const previewCount   = $('preview-count');

  // History tab
  const historySearch  = $('history-search');
  const historyList    = $('history-list');
  const btnExportAll   = $('btn-export-all');
  const btnClearHistory = $('btn-clear-history');

  // ETFs tab
  const etfList      = $('etf-list');
  const btnAddETF    = $('btn-add-etf');

  // Modal
  const modalOverlay = $('modal-overlay');
  const modalTitle   = $('modal-title');
  const modalTicker  = $('modal-ticker');
  const modalName    = $('modal-name');
  const modalUrl     = $('modal-url');
  const modalIssuer  = $('modal-issuer');
  const modalSave    = $('modal-save');
  const modalCancel  = $('modal-cancel');

  /* ── TABS ───────────────────────────────────────────── */
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'history') renderHistory();
      if (btn.dataset.tab === 'etfs')    renderETFGrid();
    });
  });

  /* ── DOWNLOAD FLOW ──────────────────────────────────── */
  btnDetect.addEventListener('click', async () => {
    const url    = inputUrl.value.trim();
    const ticker = inputTicker.value.trim().toUpperCase();
    const hint   = selectIssuer.value;

    if (!url) { UI.toast('Paste an issuer page URL first.', 'error'); return; }

    btnDetect.disabled = true;
    btnDetect.textContent = 'Working…';
    previewCard.style.display = 'none';
    UI.clearStatus(statusBox);

    try {
      const result = await Downloader.fetch(url, hint, (msg, level) => {
        UI.appendStatus(statusBox, msg, level);
      });

      currentPreview = {
        rows:        result.rows,
        issuer:      result.issuer,
        downloadUrl: result.downloadUrl,
        ticker:      ticker || 'ETF',
      };

      // Render preview
      previewTicker.textContent = currentPreview.ticker;
      previewMeta.textContent   = ISSUERS[result.issuer]?.name || result.issuer;
      UI.renderTable(previewTableWrap, result.rows);
      previewCount.textContent  = `${result.rows.length - 1} holdings`;
      previewCard.style.display = 'block';

      UI.showStatus(statusBox, `✓ ${result.rows.length - 1} holdings loaded.`, 'ok');
    } catch (e) {
      UI.showStatus(statusBox, `Error: ${e.message}`, 'error');
    } finally {
      btnDetect.disabled = false;
      btnDetect.textContent = 'Detect & Download';
    }
  });

  btnManual.addEventListener('click', () => {
    const url = inputUrl.value.trim();
    if (url) window.open(url, '_blank');
    else UI.toast('Paste a URL first.', 'error');
  });

  btnSaveHistory.addEventListener('click', () => {
    if (!currentPreview) return;
    const snap = Storage.addSnapshot(
      currentPreview.ticker,
      currentPreview.rows,
      currentPreview.downloadUrl,
      currentPreview.issuer
    );
    UI.toast(`Saved ${snap.rowCount} holdings for ${currentPreview.ticker}.`, 'ok');
  });

  btnExportCSV.addEventListener('click', () => {
    if (!currentPreview) return;
    const csv      = Storage.snapshotToCSV({ rows: currentPreview.rows });
    const dateStr  = new Date().toISOString().slice(0,10);
    const filename = `${currentPreview.ticker}_holdings_${dateStr}.csv`;
    Storage._triggerDownload(csv, filename, 'text/csv');
  });

  /* ── HISTORY TAB ────────────────────────────────────── */
  function renderHistory() {
    const term    = historySearch.value.trim();
    const history = Storage.getHistory();
    UI.renderHistory(historyList, history, term);
  }

  historySearch.addEventListener('input', renderHistory);

  historyList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, ticker, id } = btn.dataset;
    const snapshots = Storage.getSnapshotsForTicker(ticker);
    const snap      = snapshots.find(s => s.id === id);

    if (action === 'view' && snap) {
      // Switch to download tab and show the data
      tabBtns.forEach(b => { b.classList.toggle('active', b.dataset.tab === 'download'); });
      tabPanels.forEach(p => { p.classList.toggle('active', p.id === 'tab-download'); });
      currentPreview = { rows: snap.rows, issuer: snap.issuer, downloadUrl: snap.sourceUrl, ticker };
      previewTicker.textContent = ticker;
      previewMeta.textContent   = `Snapshot ${new Date(snap.date).toLocaleDateString()}`;
      UI.renderTable(previewTableWrap, snap.rows);
      previewCount.textContent  = `${snap.rowCount} holdings`;
      previewCard.style.display = 'block';
    }

    if (action === 'export' && snap) {
      Storage.downloadSnapshotCSV(ticker, snap);
    }

    if (action === 'delete' && snap) {
      if (!confirm(`Delete this snapshot for ${ticker}?`)) return;
      Storage.deleteSnapshot(ticker, id);
      UI.toast(`Snapshot deleted.`, 'ok');
      renderHistory();
    }
  });

  btnExportAll.addEventListener('click', async () => {
    btnExportAll.disabled = true;
    btnExportAll.textContent = 'Exporting…';
    const count = await Storage.exportAllCSV();
    UI.toast(`Exported ${count} CSV file${count !== 1 ? 's' : ''}.`, 'ok');
    btnExportAll.disabled = false;
    btnExportAll.textContent = 'Export All as ZIP';
  });

  btnClearHistory.addEventListener('click', () => {
    if (!confirm('Clear ALL download history? This cannot be undone.')) return;
    const history = Storage.getHistory();
    for (const ticker of Object.keys(history)) {
      delete history[ticker];
    }
    Storage.saveHistory({});
    renderHistory();
    UI.toast('History cleared.', 'ok');
  });

  /* ── ETF GRID ───────────────────────────────────────── */
  function renderETFGrid() {
    UI.renderETFGrid(etfList, Storage.getRegistry());
  }

  etfList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, ticker } = btn.dataset;
    const registry = Storage.getRegistry();
    const info     = registry[ticker];

    if (action === 'quick-download') {
      // Populate download form and trigger
      inputTicker.value     = ticker;
      inputUrl.value        = info.url || '';
      selectIssuer.value    = info.issuer || 'auto';
      // Switch tab
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'download'));
      tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-download'));
      btnDetect.click();
    }

    if (action === 'edit-etf') {
      openModal(ticker, info);
    }

    if (action === 'delete-etf') {
      if (!confirm(`Remove ${ticker} from My ETFs?`)) return;
      Storage.removeETF(ticker);
      renderETFGrid();
      UI.toast(`${ticker} removed.`, 'ok');
    }
  });

  /* ── MODAL ──────────────────────────────────────────── */
  btnAddETF.addEventListener('click', () => openModal());

  function openModal(ticker = null, info = null) {
    editingTicker        = ticker;
    modalTitle.textContent = ticker ? `Edit ${ticker}` : 'Add ETF';
    modalTicker.value    = ticker || '';
    modalTicker.disabled = !!ticker;
    modalName.value      = info?.name    || '';
    modalUrl.value       = info?.url     || '';
    modalIssuer.value    = info?.issuer  || 'auto';
    modalOverlay.classList.remove('hidden');
    (ticker ? modalName : modalTicker).focus();
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingTicker = null;
  }

  modalSave.addEventListener('click', () => {
    const ticker = editingTicker || modalTicker.value.trim().toUpperCase();
    if (!ticker) { UI.toast('Ticker is required.', 'error'); return; }
    Storage.addETF(ticker, {
      name:   modalName.value.trim(),
      url:    modalUrl.value.trim(),
      issuer: modalIssuer.value,
    });
    closeModal();
    renderETFGrid();
    UI.toast(`${ticker} saved.`, 'ok');
  });

  modalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

  /* ── INIT ───────────────────────────────────────────── */
  // Pre-fill from URL hash: index.html#SPY
  const hashTicker = location.hash.slice(1).toUpperCase();
  if (hashTicker) {
    const registry = Storage.getRegistry();
    if (registry[hashTicker]) {
      inputTicker.value = hashTicker;
      inputUrl.value    = registry[hashTicker].url || '';
      selectIssuer.value = registry[hashTicker].issuer || 'auto';
    }
  }

  console.log('[ETF Tracker] Ready. Storage:', Storage.estimateSize());
})();
