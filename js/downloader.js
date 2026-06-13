/**
 * downloader.js
 * Handles the actual fetching and parsing of ETF holdings files.
 *
 * CORS note: Issuer sites block direct browser fetch. We use a public CORS proxy
 * (allorigins.win) to fetch the page HTML and then detect the download link.
 * The actual file download is triggered via <a download> to bypass CORS on binary files.
 *
 * Supported flows:
 *   1. Known issuer with computed download URL → fetch via proxy → parse
 *   2. Unknown issuer → fetch page via proxy → scan for download link → fetch file
 *   3. Direct file URL → fetch via proxy → parse
 */

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

window.Downloader = {

  /**
   * Main entry point.
   * @param {string} pageUrl  - issuer page or direct file URL
   * @param {string} hint     - issuer key or 'auto'
   * @param {function} onLog  - callback(message, level) for status updates
   * @returns {{ rows: string[][], headers: string[], issuer: string, downloadUrl: string }}
   */
  async fetch(pageUrl, hint, onLog) {
    const log = (msg, level = 'info') => onLog && onLog(msg, level);

    log(`Detecting issuer...`);
    const detected = window.detectIssuer(pageUrl, hint);
    const issuerKey  = detected?.key  || 'unknown';
    const issuerInfo = detected?.issuer;

    log(`Issuer: ${issuerInfo?.name || 'Unknown — will scan page for download link'}`);

    let downloadUrl = null;

    // Step 1: Compute or discover download URL
    if (issuerInfo?.getDownloadUrl) {
      downloadUrl = issuerInfo.getDownloadUrl(pageUrl);
      if (downloadUrl) {
        log(`Download URL computed: ${downloadUrl}`);
      }
    }

    if (!downloadUrl) {
      log(`Fetching issuer page to find download link...`);
      downloadUrl = await this._scrapeDownloadLink(pageUrl, issuerInfo?.scrapeSelector, log);
    }

    if (!downloadUrl) {
      // Last resort: try the page URL itself as a direct file
      if (pageUrl.match(/\.(csv|xlsx|json|txt)(\?.*)?$/i)) {
        downloadUrl = pageUrl;
        log(`Using page URL as direct file.`, 'warn');
      } else {
        throw new Error(
          'Could not find a holdings download link on this page.\n' +
          'Try selecting the specific issuer or pasting the direct CSV/file URL.'
        );
      }
    }

    // Step 2: Fetch the file
    log(`Fetching holdings file...`);
    const { text, contentType } = await this._fetchFile(downloadUrl, log);

    // Step 3: Parse
    log(`Parsing data...`);
    const format = this._inferFormat(downloadUrl, contentType, issuerInfo);
    const skipRows = issuerInfo?.skipRows || 0;

    let rows;
    if (format === 'json') {
      rows = this._parseJSON(text, issuerInfo?.jsonPath);
    } else {
      rows = this._parseCSV(text, skipRows);
    }

    if (!rows || rows.length < 2) {
      throw new Error('Parsed file has no data rows. The format may have changed — check the file manually.');
    }

    log(`Parsed ${rows.length - 1} holdings.`, 'ok');
    return { rows, headers: rows[0], issuer: issuerKey, downloadUrl };
  },

  /* ── PAGE SCRAPING ─────────────────────────────────────── */

  async _scrapeDownloadLink(pageUrl, selector, log) {
    try {
      const proxyUrl = CORS_PROXY + encodeURIComponent(pageUrl);
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();

      // Try supplied selector patterns first
      const patterns = [
        selector,
        'a[href*="holdings"][href$=".csv"]',
        'a[href*="holdings"][href$=".xlsx"]',
        'a[href*="download"][href$=".csv"]',
        'a[href*="Download"][href*=".csv"]',
        'a[href*="HoldingsByDate"]',
        'a[href*="holdings"][href*="fileType=csv"]',
        'a[href*="holdings"][href*="type=csv"]',
      ].filter(Boolean);

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      for (const pat of patterns) {
        try {
          const el = doc.querySelector(pat);
          if (el) {
            let href = el.getAttribute('href');
            if (href) {
              // Resolve relative URLs
              if (href.startsWith('/')) {
                const base = new URL(pageUrl);
                href = base.origin + href;
              }
              log(`Found link via selector: ${pat}`);
              return href;
            }
          }
        } catch { /* bad selector, skip */ }
      }

      // Regex fallback: scan all hrefs for CSV/XLSX patterns
      const linkMatches = [...html.matchAll(/href="([^"]*(?:holding|portfolio)[^"]*\.(?:csv|xlsx)[^"]*)"/gi)];
      if (linkMatches.length > 0) {
        let href = linkMatches[0][1].replace(/&amp;/g, '&');
        if (href.startsWith('/')) {
          const base = new URL(pageUrl);
          href = base.origin + href;
        }
        log(`Found link via regex scan.`);
        return href;
      }

      log(`No download link found in page source.`, 'warn');
      return null;
    } catch (e) {
      log(`Page scrape failed: ${e.message}`, 'warn');
      return null;
    }
  },

  /* ── FILE FETCH ────────────────────────────────────────── */

  async _fetchFile(fileUrl, log) {
    // Try direct fetch first
    try {
      const resp = await fetch(fileUrl, { mode: 'cors' });
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        const text = await resp.text();
        return { text, contentType };
      }
    } catch { /* CORS blocked, fall through to proxy */ }

    // Via CORS proxy
    log(`Direct fetch blocked, using CORS proxy...`, 'warn');
    const proxyUrl = CORS_PROXY + encodeURIComponent(fileUrl);
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`Proxy fetch failed: HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    return { text, contentType };
  },

  /* ── FORMAT INFERENCE ──────────────────────────────────── */

  _inferFormat(url, contentType, issuerInfo) {
    if (issuerInfo?.format && issuerInfo.format !== 'auto') return issuerInfo.format;
    if (contentType.includes('json')) return 'json';
    if (url.match(/\.(xlsx|xls)(\?.*)?$/i)) return 'xlsx'; // note: xlsx needs SheetJS
    return 'csv';
  },

  /* ── CSV PARSER ────────────────────────────────────────── */

  _parseCSV(text, skipRows = 0) {
    const lines = text.split(/\r?\n/);
    const dataLines = lines.slice(skipRows).filter(l => l.trim() !== '');

    return dataLines.map(line => {
      const cells = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++; }
          else { inQ = !inQ; }
        } else if (ch === ',' && !inQ) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    }).filter(row => row.some(cell => cell !== ''));
  },

  /* ── JSON PARSER ───────────────────────────────────────── */

  _parseJSON(text, jsonPath) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON from API.'); }

    // Traverse dot-path (e.g. 'holdingDetails')
    if (jsonPath) {
      for (const key of jsonPath.split('.')) {
        data = data?.[key];
      }
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('JSON response has no array data at expected path.');
    }

    // Convert array of objects → rows (header + data)
    const headers = Object.keys(data[0]);
    const rows = [headers, ...data.map(item => headers.map(h => String(item[h] ?? '')))];
    return rows;
  },
};
