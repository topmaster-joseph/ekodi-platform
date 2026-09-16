import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('independent sites inherit the mandatory platform baseline without shared brand chrome', async () => {
  const [policy, baseline, missionCss, router, eventPage] = await Promise.all([
    readFile(new URL('../config/platform-ui-baseline.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../shell/platform-baseline.css', import.meta.url), 'utf8'),
    readFile(new URL('../space/ekodimission.css', import.meta.url), 'utf8'),
    readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../space/ekodimission-activity.page', import.meta.url), 'utf8'),
  ]);

  assert.equal(policy.layers.baseline.mandatory, true);
  assert.equal(policy.layers.brandShell.mandatory, false);
  assert.ok(policy.scope.includes('independent-site'));
  assert.match(policy.independenceRule, /never exempts a site from platform baseline invariants/i);

  for (const marker of ['word-break:keep-all','overflow-wrap:break-word','hyphens:none','[data-ekodi-break-anywhere]']) {
    assert.ok(baseline.includes(marker), marker);
  }
  assert.match(missionCss, /^@import url\("https:\/\/ekodi\.kr\/shell\/platform-baseline\.css\?v=1"\);/);

  assert.match(router, /x-ekodi-independent-site/);
  assert.match(router, /independent-workspace-site/);
  assert.match(router, /return progressiveHome\?injectEkodiProgressiveHome\(routed\):routed/);

  assert.match(eventPage, /id=apply/);
  assert.match(eventPage, /href="#apply">참가 신청/);
  assert.match(eventPage, /docs\.google\.com\/forms\/d\/1_j7JxLPYcUWg2mqHcGTJfWgmijz5cTTJp-BeQI63SJc\/viewform/);
});
