/**
 * issuers.js
 * Defines known ETF issuer detection rules and their holdings download URL patterns.
 * Add new issuers here without touching other files.
 */

window.ISSUERS = {

  ishares: {
    name: 'iShares (BlackRock)',
    detect: (url) => url.includes('ishares.com') || url.includes('blackrock.com'),
    /**
     * iShares holdings CSV pattern:
     * Page URL: https://www.ishares.com/us/products/239726/ISHARES-CORE-SP-500-ETF
     * CSV URL:  https://www.ishares.com/us/products/239726/ISHARES-CORE-SP-500-ETF/1467271812596.ajax?tab=holdings&fileType=csv
     */
    getDownloadUrl: (pageUrl) => {
      return pageUrl.replace(/\?.*$/, '') + '/1467271812596.ajax?tab=holdings&fileType=csv';
    },
    format: 'csv',
    skipRows: 9, // iShares CSV has metadata header rows before the actual data
  },

  vanguard: {
    name: 'Vanguard',
    detect: (url) => url.includes('vanguard.com'),
    /**
     * Vanguard uses a JSON API for holdings.
     * Page URL pattern: https://investor.vanguard.com/investment-products/etfs/profile/spy
     * We extract the fund ID from the URL and hit their holdings API.
     */
    getDownloadUrl: (pageUrl) => {
      // Extract portId from URL like /profile/VOO or /etfs/profile/VOO
      const match = pageUrl.match(/\/profile\/([A-Z0-9]+)/i);
      if (!match) return null;
      const ticker = match[1].toUpperCase();
      return `https://advisors.vanguard.com/web/ecs/fund-details/portfolio/holding?ticker=${ticker}&assetClass=etf`;
    },
    format: 'json',
    jsonPath: 'holdingDetails',
  },

  ssga: {
    name: 'SSGA (SPDR)',
    detect: (url) => url.includes('ssga.com') || url.includes('spdrs.com') || url.includes('spdrfunds.com'),
    /**
     * SSGA provides an Excel/CSV download. The URL structure includes a fund code.
     * Direct download link is usually discoverable on the page.
     */
    getDownloadUrl: (pageUrl) => null, // Must scrape for link
    format: 'csv',
    scrapeSelector: 'a[href*="holdings"][href$=".xlsx"], a[href*="holdings"][href$=".csv"]',
    skipRows: 4,
  },

  invesco: {
    name: 'Invesco',
    detect: (url) => url.includes('invesco.com'),
    getDownloadUrl: (pageUrl) => null,
    format: 'csv',
    scrapeSelector: 'a[href*="holdings"][href$=".csv"], a[href*="HoldingsByDate"]',
  },

  wisdomtree: {
    name: 'WisdomTree',
    detect: (url) => url.includes('wisdomtree.com'),
    getDownloadUrl: (pageUrl) => null,
    format: 'csv',
    scrapeSelector: 'a[href*="download"][href*="holding"], a[href*="Holdings"][href$=".csv"]',
  },

  vaneck: {
    name: 'VanEck',
    detect: (url) => url.includes('vaneck.com'),
    getDownloadUrl: (pageUrl) => null,
    format: 'csv',
    scrapeSelector: 'a[href*="holdings"][href$=".csv"], a[href*="Download"]',
  },

  ark: {
    name: 'ARK Invest',
    detect: (url) => url.includes('ark-funds.com') || url.includes('arkfunds.io'),
    /**
     * ARK publishes daily holdings as CSV directly.
     * https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv
     */
    getDownloadUrl: (pageUrl) => {
      const tickerMatch = pageUrl.match(/\b(ARK[A-Z]|ARKG|ARKK|ARKW|ARKF|ARKQ|ARKX|PRNT|IZRL)\b/i);
      if (!tickerMatch) return null;
      const ticker = tickerMatch[1].toUpperCase();
      return `https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_${ticker}_HOLDINGS.csv`;
    },
    format: 'csv',
    skipRows: 0,
  },

  direct: {
    name: 'Direct file URL',
    detect: (url) => url.match(/\.(csv|xlsx|xls|json|txt)(\?.*)?$/i) !== null,
    getDownloadUrl: (pageUrl) => pageUrl,
    format: 'auto', // infer from extension
    skipRows: 0,
  },

};

/**
 * Detect issuer from URL or user hint.
 * @param {string} url
 * @param {string} hint - key from ISSUERS or 'auto'
 * @returns {{ key: string, issuer: object }|null}
 */
window.detectIssuer = function(url, hint = 'auto') {
  if (hint && hint !== 'auto' && window.ISSUERS[hint]) {
    return { key: hint, issuer: window.ISSUERS[hint] };
  }
  for (const [key, issuer] of Object.entries(window.ISSUERS)) {
    if (issuer.detect && issuer.detect(url)) {
      return { key, issuer };
    }
  }
  return null;
};
