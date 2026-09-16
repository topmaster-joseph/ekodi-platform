import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('all, user and brand site operating principles keep brand independence without losing the mandatory baseline', async () => {
  const [policy, baseline, missionCss, router, eventPage] = await Promise.all([
    readFile(new URL('../config/platform-ui-baseline.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../shell/platform-baseline.css', import.meta.url), 'utf8'),
    readFile(new URL('../space/ekodimission.css', import.meta.url), 'utf8'),
    readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../space/ekodimission-activity.page', import.meta.url), 'utf8'),
  ]);

  assert.equal(policy.siteClasses['all-sites'].mandatory, true);
  assert.deepEqual(policy.siteClasses['user-site'].inherits, ['all-sites']);
  assert.deepEqual(policy.siteClasses['brand-site'].inherits, ['all-sites']);
  assert.ok(policy.siteClasses['brand-site'].examples.includes('ekodimission'));
  assert.ok(policy.siteClasses['brand-site'].examples.includes('jadam'));
  assert.equal(policy.compatibility.deprecatedTechnicalTerm, 'independent-site');
  assert.equal(policy.compatibility.mapsTo, 'brand-site');
  assert.match(policy.compatibility.rule, /never bypasses all-site operating principles/i);

  for (const marker of ['word-break:keep-all','overflow-wrap:break-word','hyphens:none','[data-ekodi-break-anywhere]']) {
    assert.ok(baseline.includes(marker), marker);
  }
  assert.match(missionCss, /^@import url\("https:\/\/ekodi\.kr\/shell\/platform-baseline\.css\?v=1"\);/);

  // Technical compatibility remains until routing headers are migrated, but policy calls the class brand-site.
  assert.match(router, /x-ekodi-independent-site/);
  assert.match(router, /independent-workspace-site/);

  // The public-facing EKODI application entry remains stable even if the downstream form provider changes.
  assert.match(eventPage, /id=apply/);
  assert.match(eventPage, /href="#apply">참가 신청/);
  assert.match(eventPage, /docs\.google\.com\/forms\/d\/1_j7JxLPYcUWg2mqHcGTJfWgmijz5cTTJp-BeQI63SJc\/viewform/);
});
