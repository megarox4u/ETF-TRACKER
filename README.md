# ETF Holdings Tracker

A pure-browser tool to download, preview, and track ETF holdings snapshots over time. Runs on **GitHub Pages** — no server, no backend.

## Features

- **Auto-detect holdings links** from ETF issuer pages via URL pattern matching and page scraping
- **Supported issuers out of the box:** iShares, Vanguard, SSGA/SPDR, Invesco, WisdomTree, VanEck, ARK Invest, direct file URLs
- **Per-ETF snapshot history** stored in browser `localStorage`
- **Export individual snapshots or all history** as CSV files
- **My ETFs registry** — save tickers with their issuer URLs for one-click re-download
- Zero dependencies, zero build step

---

## Hosting on GitHub Pages

1. Fork or push this repo to GitHub
2. Go to **Settings → Pages → Source** → `main` branch → `/ (root)`
3. Visit `https://<your-username>.github.io/<repo-name>/`

---

## Adding a New Issuer

Edit `js/issuers.js` and add an entry to the `window.ISSUERS` object:

```js
myissuer: {
  name: 'My ETF Provider',
  detect: (url) => url.includes('myissuer.com'),
  getDownloadUrl: (pageUrl) => {
    // Return the direct file URL, or null to trigger page scraping
    return pageUrl + '/holdings.csv';
  },
  format: 'csv',      // 'csv' | 'json' | 'xlsx'
  skipRows: 2,        // rows to skip before header (metadata rows)
},
```

If `getDownloadUrl` returns `null`, the scraper falls back to scanning the page HTML for `<a>` tags matching CSV/XLSX patterns defined in `scrapeSelector`.

---

## CORS Limitations

Issuer sites block direct cross-origin requests. The app uses [allorigins.win](https://allorigins.win) as a CORS proxy for page scraping and file fetching. Some issuers may still block proxy requests — in that case:

- Use the **"Open URL Manually"** button to download the file in a new tab
- Drag-and-drop or paste the file URL directly as a `direct` issuer type

For production use, deploy your own CORS proxy (e.g. a Cloudflare Worker or a simple Express proxy) and update `CORS_PROXY` in `js/downloader.js`.

---

## Data Storage

All data is stored in **browser `localStorage`**. Nothing is sent to any server.

| Key | Contents |
|-----|----------|
| `etf_tracker_registry` | Your saved ETF entries |
| `etf_tracker_history`  | Snapshot history per ticker (max 365 per ETF) |

To migrate data between browsers, export all CSV files from the History tab.

---

## Project Structure

```
etf-tracker/
├── index.html          # Single-page app shell
├── css/
│   └── style.css       # Dark terminal aesthetic
└── js/
    ├── issuers.js      # Issuer detection + download URL rules
    ├── storage.js      # localStorage read/write + CSV export
    ├── downloader.js   # Fetch, scrape, parse (CSV/JSON)
    ├── ui.js           # Table/history/grid rendering helpers
    └── app.js          # Main controller
```
