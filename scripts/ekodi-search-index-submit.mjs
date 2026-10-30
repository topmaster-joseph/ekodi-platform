import { EKODI_INDEXNOW_KEY } from '../platform-indexnow.js';
import { SEONAMMEDI_CANONICAL_ORIGIN, canonicalIndexNowUrlsFromSitemap } from './seonammedi-indexnow-public-sitemap.mjs';
import { submitIndexNowBatches } from './seonammedi-indexnow-batch.mjs';

// Read the same PUBLIC Korean IDN sitemap that Naver/Bing can crawl.
// The whitelist in canonicalIndexNowUrlsFromSitemap fails closed if a private,
// cross-domain, or noncanonical URL appears here.
const sitemapUrl = SEONAMMEDI_CANONICAL_ORIGIN + '/sitemap.xml';
const sitemapResponse = await fetch(sitemapUrl, {
  headers: { accept: 'application/xml' },
  signal: AbortSignal.timeout(25000),
});
if (!sitemapResponse.ok) throw new Error('Public Korean sitemap unavailable: HTTP ' + sitemapResponse.status);
const pageUrls = canonicalIndexNowUrlsFromSitemap(await sitemapResponse.text());

// IndexNow supports one JSON POST for up to 10,000 URLs. Send only three
// requests to the participating endpoints instead of a full Chromium browser
// and one navigation for each page/engine.
const outcome = await submitIndexNowBatches({
  urls: pageUrls,
  key: EKODI_INDEXNOW_KEY,
  canonicalOrigin: SEONAMMEDI_CANONICAL_ORIGIN,
});
console.log(JSON.stringify(outcome, null, 2));
if (!outcome.ok) process.exitCode = 1;
