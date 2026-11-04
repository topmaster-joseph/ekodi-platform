import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const extract = (html, regex) => html.match(regex)?.[0] || '';

test('Church Live shares the Church homepage footer contract and responsive header structure', async () => {
  const [home, live] = await Promise.all([read('index.html'), read('live/index.html')]);
  const homeFooter = extract(home, /<footer class="site-footer church-footer" data-ekodi-service-footer>[\s\S]*?<\/footer>/);
  const liveFooter = extract(live, /<footer class="site-footer church-footer" data-ekodi-service-footer>[\s\S]*?<\/footer>/);
  assert.ok(homeFooter && liveFooter, 'both surfaces must expose the church-native footer');
  assert.equal(liveFooter, homeFooter, 'Church Live footer markup should remain identical to church home');
  for (const token of ['class="site-header"', 'class="brand"', 'class="brand-mark"',
    'class="daily-verse"', 'class="menu-button"', 'id="main-nav"']) {
    assert.ok(live.includes(token), 'missing shared church header component: ' + token);
  }
  assert.match(live, /src="\.\.\/church-shell\.js" defer/);
  assert.match(live, /src="\.\.\/church-daily-verse\.js" defer/);
  assert.match(live, /href="\.\.\/church-footer\.css"/);
  assert.match(live, /data-ekodi-service="church"/);
  assert.match(live, /id="liveState"/, 'broadcast status must remain visible to the application');
});

test('Church Live centers content on the same 1120px grid without forced Korean line breaks', async () => {
  const [html, css] = await Promise.all([read('live/index.html'), read('live/church-live-layout.css')]);
  assert.match(css, /--church-content-width:1120px/);
  assert.match(css, /\.live-shell\{width:min\(var\(--church-content-width\),calc\(100% - 40px\)\)/);
  assert.match(css, /\.live-intro\{[^}]*margin:0 auto;[^}]*text-align:center/);
  assert.match(css, /\.live-intro h1\{[^}]*word-break:keep-all;overflow-wrap:normal/);
  assert.match(css, /\.live-intro \.entry-actions\{justify-content:center/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:359px\)/);
  assert.doesNotMatch(html, /예배를 방송하고,<br\s*\/?\s*>/);
  assert.match(html, /id="hostButton"/);
  assert.match(html, /id="joinButton"/);
  assert.match(html, /id="studioView"/);
  assert.match(html, /id="viewerView"/);
});

test('Church Live mobile menu has accessible expanded state and close actions', async () => {
  const [html, js] = await Promise.all([read('live/index.html'), read('live/church-live-shell.js')]);
  assert.match(html, /aria-expanded="false" aria-controls="main-nav"/);
  assert.match(html, /src="\.\/church-live-shell\.js" defer/);
  assert.match(js, /nav\.classList\.toggle\('open'\)/);
  assert.match(js, /button\.setAttribute\('aria-expanded', String\(open\)\)/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /event\.target\.closest\('a'\)/);
});
