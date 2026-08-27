import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const authHtml = await readFile(`${root}auth-site/index.html`, 'utf8');
const controlCss = await readFile(`${root}control-center.css`, 'utf8');

test('seamless auth shell is a single-column viewport-centered layout', () => {
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.shell\{[^}]*min-height:100dvh/);
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.shell\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.shell\{[^}]*gap:0/);
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.shell\{[^}]*place-items:center/);
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.shell\{[^}]*padding:20px!important/);
});

test('seamless auth card is explicitly pinned to the center', () => {
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.auth-card\{[^}]*width:min\(100%,440px\)/);
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.auth-card\{[^}]*justify-self:center/);
  assert.match(authHtml, /html\[data-seamless-sso="1"\] \.auth-card\{[^}]*align-self:center/);
});

test('admin pre-auth screen remains centered while authenticated dashboard layout stays separate', () => {
  assert.match(controlCss, /\.login-screen\{min-height:100vh;display:grid;place-items:center;padding:24px\}/);
  assert.match(controlCss, /\.app\{min-height:100vh;display:grid;grid-template-columns:250px minmax\(0,1fr\)\}/);
});
