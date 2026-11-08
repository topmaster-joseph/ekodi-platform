import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import board from '../services/independent-board/worker.js';
import {isAllowedTelemetryOrigin, trafficSiteIdForVisit} from '../traffic-intelligence.js';

// SITE-FOOTER-TRAFFIC-ENFORCED: every public page of a native-footer site must
// show the shared visit summary in its footer and send the anonymous beacon.
const BEACON = '<script src="https://ekodi.kr/shell/native-visit-beacon.js" defer></script>';
const FOOTER = '<script src="https://ekodi.kr/shell/user-ui-footer.js" defer></script>';

function assertFooterTraffic(source, label) {
  assert.match(source, /<html[^>]*data-ekodi-shell-surface="public"/, label + ': public surface marker');
  assert.ok(source.includes(BEACON), label + ': visit beacon');
  assert.ok(source.includes(FOOTER), label + ': footer visit summary');
  assert.ok(source.indexOf(BEACON) < source.indexOf(FOOTER), label + ': beacon before footer');
  assert.equal(source.split('shell/user-ui-footer.js').length - 1, 1, label + ': loaded once');
  assert.match(source, /<footer class="site-footer">/, label + ': native site footer');
}

async function htmlPages(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'admin') out.push(...await htmlPages(path)); }
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

test('every public static seonammedi page carries the footer visit summary', async () => {
  // finance/ is a script-free stub by security policy (no ledger UI on public routes).
  const pages = (await htmlPages('sites/seonammedi/public')).filter(p => !p.endsWith('finance/index.html'));
  assert.ok(pages.length >= 3, 'expected home, notices, minutes');
  for (const page of pages) assertFooterTraffic(await readFile(page, 'utf8'), page);
});

test('every public independent-board page carries the footer visit summary', async () => {
  for (const path of ['/board/voices', '/board/notices', '/board/news']) {
    for (const host of ['https://seonammedi.kr', 'https://ekodi.kr/seonammedi']) {
      const response = await board.fetch(new Request(host + path), {});
      if (response.status !== 200 || !String(response.headers.get('content-type')).includes('text/html')) continue;
      assertFooterTraffic(await response.text(), host + path);
    }
  }
});

test('both seonammedi domains (English and Korean IDN) may record and read site visits', () => {
  for (const origin of ['https://seonammedi.kr', 'https://www.seonammedi.kr', 'https://xn--3e0b8b58jw4co4mnpll3k.kr']) {
    assert.ok(isAllowedTelemetryOrigin(origin), origin);
    assert.equal(trafficSiteIdForVisit(new URL(origin).hostname, 'board'), 'seonammedi', origin);
  }
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'seonammedi'), 'seonammedi');
});
