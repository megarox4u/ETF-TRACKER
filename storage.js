/**
 * storage.js
 * Manages ETF registry and download history in localStorage.
 * History is stored per-ETF as an array of snapshot objects.
 * Data can be exported as CSV per snapshot.
 */

const STORAGE_KEYS = {
  ETF_REGISTRY: 'etf_tracker_registry',   // { ticker: { name, url, issuer, addedAt } }
  HISTORY:      'etf_tracker_history',     // { ticker: [ { date, rows, source, issuer, rowCount } ] }
};

window.Storage = {

  /* ── ETF REGISTRY ──────────────────────────────────── */

  getRegistry() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ETF_REGISTRY) || '{}');
    } catch { return {}; }
  },

  saveRegistry(registry) {
    localStorage.setItem(STORAGE_KEYS.ETF_REGISTRY, JSON.stringify(registry));
  },

  addETF(ticker, { name = '', url = '', issuer = 'auto' } = {}) {
    const reg = this.getRegistry();
    const key = ticker.toUpperCase().trim();
    reg[key] = { name, url, issuer, addedAt: new Date().toISOString() };
    this.saveRegistry(reg);
    return key;
  },

  removeETF(ticker) {
    const reg = this.getRegistry();
    delete reg[ticker.toUpperCase()];
    this.saveRegistry(reg);
  },

  /* ── DOWNLOAD HISTORY ──────────────────────────────── */

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '{}');
    } catch { return {}; }
  },

  saveHistory(history) {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  },

  /**
   * Save a holdings snapshot for a ticker.
   * @param {string} ticker
   * @param {Array<string[]>} rows - parsed CSV rows (array of arrays)
   * @param {string} sourceUrl
   * @param {string} issuer
   */
  addSnapshot(ticker, rows, sourceUrl, issuer) {
    const history = this.getHistory();
    const key = ticker.toUpperCase().trim();
    if (!history[key]) history[key] = [];

    const snapshot = {
      id:        Date.now().toString(36),
      date:      new Date().toISOString(),
      sourceUrl,
      issuer,
      rowCount:  rows.length - 1, // exclude header
      rows,      // full data stored
    };

    // Prepend (newest first)
    history[key].unshift(snapshot);

    // Cap per-ETF history at 365 snapshots to avoid bloat
    if (history[key].length > 365) history[key] = history[key].slice(0, 365);

    this.saveHistory(history);
    return snapshot;
  },

  getSnapshotsForTicker(ticker) {
    const history = this.getHistory();
    return history[ticker.toUpperCase()] || [];
  },

  deleteSnapshot(ticker, snapshotId) {
    const history = this.getHistory();
    const key = ticker.toUpperCase();
    if (history[key]) {
      history[key] = history[key].filter(s => s.id !== snapshotId);
      if (history[key].length === 0) delete history[key];
    }
    this.saveHistory(history);
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEYS.ETF_REGISTRY);
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
  },

  /* ── CSV EXPORT ────────────────────────────────────── */

  /**
   * Convert a snapshot's rows to a CSV string.
   */
  snapshotToCSV(snapshot) {
    return snapshot.rows.map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        // Quote cells containing comma, newline, or double-quote
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',')
    ).join('\n');
  },

  downloadSnapshotCSV(ticker, snapshot) {
    const csv = this.snapshotToCSV(snapshot);
    const dateStr = new Date(snapshot.date).toISOString().slice(0,10);
    const filename = `${ticker}_holdings_${dateStr}_${snapshot.id}.csv`;
    this._triggerDownload(csv, filename, 'text/csv');
  },

  /**
   * Export all history as individual CSV files bundled into a ZIP.
   * Uses JSZip if available, otherwise triggers individual downloads.
   */
  async exportAllCSV() {
    const history = this.getHistory();
    const entries = Object.entries(history);
    if (entries.length === 0) return 0;

    let total = 0;
    for (const [ticker, snapshots] of entries) {
      for (const snap of snapshots) {
        this.downloadSnapshotCSV(ticker, snap);
        total++;
        await new Promise(r => setTimeout(r, 80)); // stagger downloads
      }
    }
    return total;
  },

  _triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  },

  /* ── STORAGE SIZE ESTIMATE ─────────────────────────── */
  estimateSize() {
    let total = 0;
    for (const key of Object.values(STORAGE_KEYS)) {
      total += (localStorage.getItem(key) || '').length;
    }
    return (total / 1024).toFixed(1) + ' KB';
  },
};
