import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('control.html');
const css = read('control.css');
const js = read('control.js');

test('premium Control is explicitly scoped to its own administrative workspace', () => {
  assert.match(html, /data-ekodi-control="v2" data-ekodi-control-design="premium"/);
  assert.match(html, /\/control\.css\?v=20261017-premium-steady-v4/);
  assert.match(css, /html\[data-ekodi-control="v2"\]\[data-ekodi-control-design="premium"\]/);
  assert.match(css, /color-scheme:light!important/);
  assert.match(css, /\.control-main \.view\.active/);
  assert.match(css, /background:#fff!important;color:#14202b!important/);
  assert.match(css, /\.composer textarea::placeholder/);
  assert.match(css, /:focus-visible/);
});

test('primary desktop and mobile command controls stay visible and operable', () => {
  for (const control of ['newTask','commandForm','commandInput','executionTarget','executeNow','aiRoutePreview','orchestratorRelease','sendButton','railOpen','railClose','runtimeStatus']) {
    assert.match(html, new RegExp('id="' + control + '"'), control);
  }
  assert.match(html, /class="skip-link" href="#commandInput"/);
  assert.match(html, /class="composer-heading"/);
  assert.match(html, /class="brand-symbol"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.composer-row\{/);
  assert.match(css, /flex-wrap:wrap/);
  assert.match(css, /\.control-rail\.open/);
  assert.match(css, /\.composer-wrap\{/);
  assert.match(css, /left:0!important/);
});

test('command routing and guarded deployments remain untouched', () => {
  assert.match(js, /\/api\/control\/ai\/v8\/pulse/);
  assert.match(js, /\/api\/control\/ai\/assist/);
  assert.match(js, /\/api\/control\/ai\/v8\/orchestrator\/submit/);
  assert.match(html, /id="orchestratorRelease"/);
  assert.doesNotMatch(html, /<input[^>]*id="orchestratorRelease"[^>]*\schecked(?:\s|>|=)/);
  assert.match(html, /이 브라우저/);
  assert.match(html, /class="composer-note"/);
});
