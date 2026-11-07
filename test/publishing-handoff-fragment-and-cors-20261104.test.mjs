import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MENU_JS } from '../scripts/site-chrome.mjs';

const RETIRED = /https:\/\/(?:jadam|pizzamaru|yogurt)(?:\.ai)?\.ekodi\.kr/;

function runMenu(hash) {
  const calls = [];
  const location = { hash, pathname: '/publishing/human/manage/', search: '?x=1' };
  const document = { querySelector: () => null, getElementById: () => null, addEventListener() {} };
  const history = { state: null, replaceState: (s, t, url) => { calls.push(url); location.hash = ''; } };
  vm.runInNewContext(MENU_JS, { location, document, history, URL, URLSearchParams });
  return { calls, location };
}

test('publishing/books chrome erases the one-time login handoff fragment from the address bar', () => {
  const { calls, location } = runMenu('#ekodi_token=abc123&ekodi_type=email');
  assert.deepEqual(calls, ['/publishing/human/manage/?x=1']);
  assert.equal(location.hash, '');
});

test('publishing/books chrome keeps unrelated in-page anchors', () => {
  assert.deepEqual(runMenu('#ws-mine').calls, []);
  assert.deepEqual(runMenu('').calls, []);
});

test('generated menu.js copies carry the eraser', () => {
  for (const f of ['publishing/menu.js', 'books/menu.js']) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(s, /AUTH-HANDOFF-FRAGMENT-ERASE-001/);
    assert.equal(s, MENU_JS);
  }
});

test('retired EKODI store subdomains are not allowed CORS origins', () => {
  for (const f of ['wrangler.marketing-publishing.toml']) {
    const line = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').match(/^ALLOWED_ORIGINS = "([^"]*)"/m);
    assert.ok(line, `${f} ALLOWED_ORIGINS`);
    assert.doesNotMatch(line[1], RETIRED, f);
    assert.match(line[1], /(^|,)https:\/\/ekodi\.kr(,|$)/, f);
  }
});
