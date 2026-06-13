/**
 * ui.js
 * Rendering helpers: tables, history list, ETF grid, toast, status box.
 */

window.UI = {

  /* ── STATUS BOX ─────────────────────────────────────── */

  showStatus(el, message, level = 'info') {
    el.className = `status-box ${level}`;
    el.textContent = message;
    el.classList.remove('hidden');
  },

  appendStatus(el, message, level = 'info') {
    el.className = `status-box ${level}`;
    el.textContent += (el.textContent ? '\n' : '') + `[${level.toUpperCase()}] ${message}`;
    el.classList.remove('hidden');
  },

  clearStatus(el) {
    el.textContent = '';
    el.classList.add('hidden');
  },

  /* ── TOAST ──────────────────────────────────────────── */

  toast(message, level = 'ok', duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast ${level}`;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), duration);
  },

  /* ── DATA TABLE ─────────────────────────────────────── */

  renderTable(container, rows, maxRows = 50) {
    if (!rows || rows.length < 2) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:16px">No data</p>';
      return;
    }
    const [headers, ...data] = rows;
    const preview = data.slice(0, maxRows);

    const table = document.createElement('table');
    // Header
    const thead = table.createTHead();
    const hRow = thead.insertRow();
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      hRow.appendChild(th);
    });
    // Body
    const tbody = table.createTBody();
    preview.forEach(row => {
      const tr = tbody.insertRow();
      headers.forEach((_, i) => {
        const td = tr.insertCell();
        td.textContent = row[i] ?? '';
      });
    });

    container.innerHTML = '';
    container.appendChild(table);

    if (data.length > maxRows) {
      const note = document.createElement('p');
      note.style.cssText = 'padding:8px 12px;font-size:11px;color:var(--text-dim);font-family:var(--mono)';
      note.textContent = `Showing first ${maxRows} of ${data.length} rows. Export CSV to see all.`;
      container.appendChild(note);
    }
  },

  /* ── HISTORY LIST ───────────────────────────────────── */

  renderHistory(container, history, searchTerm = '') {
    const entries = Object.entries(history)
      .filter(([ticker]) => !searchTerm || ticker.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          ${searchTerm ? `No results for "${searchTerm}"` : 'No download history yet. Download some holdings to get started.'}
        </div>`;
      return;
    }

    container.innerHTML = '';
    for (const [ticker, snapshots] of entries) {
      const group = document.createElement('div');
      group.className = 'history-group';
      group.dataset.ticker = ticker;

      const header = document.createElement('div');
      header.className = 'history-group-header';
      header.innerHTML = `
        <span class="history-ticker">${ticker}</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="history-count">${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}</span>
          <span class="history-chevron">▾</span>
        </div>`;
      header.addEventListener('click', () => {
        group.classList.toggle('open');
      });

      const rowsDiv = document.createElement('div');
      rowsDiv.className = 'history-rows';

      for (const snap of snapshots) {
        const dateStr = new Date(snap.date).toLocaleString();
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
          <span class="history-date">${dateStr}</span>
          <span class="history-info">${snap.rowCount} holdings · ${ISSUERS[snap.issuer]?.name || snap.issuer || 'unknown'}</span>
          <div class="history-actions">
            <button class="btn-icon" data-action="view" data-ticker="${ticker}" data-id="${snap.id}">View</button>
            <button class="btn-icon" data-action="export" data-ticker="${ticker}" data-id="${snap.id}">Export CSV</button>
            <button class="btn-icon delete" data-action="delete" data-ticker="${ticker}" data-id="${snap.id}">Delete</button>
          </div>`;
        rowsDiv.appendChild(row);
      }

      group.appendChild(header);
      group.appendChild(rowsDiv);
      container.appendChild(group);
    }
  },

  /* ── ETF GRID ───────────────────────────────────────── */

  renderETFGrid(container, registry) {
    const entries = Object.entries(registry).sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">📋</div>
          No ETFs saved yet. Add one above to track it.
        </div>`;
      return;
    }

    container.innerHTML = '';
    for (const [ticker, info] of entries) {
      const card = document.createElement('div');
      card.className = 'etf-card';
      card.innerHTML = `
        <div class="etf-card-header">
          <span class="etf-card-ticker">${ticker}</span>
          <span class="etf-card-issuer">${ISSUERS[info.issuer]?.name || info.issuer || '?'}</span>
        </div>
        ${info.name ? `<div class="etf-card-name">${info.name}</div>` : ''}
        <div class="etf-card-url" title="${info.url}">${info.url || '—'}</div>
        <div class="etf-card-actions">
          <button class="btn-primary btn-sm" data-action="quick-download" data-ticker="${ticker}">↓ Download Now</button>
          <button class="btn-ghost btn-sm" data-action="edit-etf" data-ticker="${ticker}">Edit</button>
          <button class="btn-ghost btn-sm" data-action="delete-etf" data-ticker="${ticker}" style="color:var(--red)">Remove</button>
        </div>`;
      container.appendChild(card);
    }
  },

};
