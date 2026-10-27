// BOOKS-MENU-001: 모바일 MENU 버튼이 있는 모든 서점 화면은 메뉴를 여는 스크립트를 불러와야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../books/', import.meta.url).pathname;
const pages = [];
(function walk(dir) { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (name === 'index.html') pages.push(p); } })(root);

test('every bookstore page with a MENU button wires it up', () => {
  const missing = pages.filter(p => { const s = readFileSync(p, 'utf8'); return s.includes('class="menu-button"') && !/src="\/(?:app|menu|publishing\/app)\.js"/.test(s); });
  assert.deepEqual(missing.map(p => p.slice(root.length)), []);
  const inline = pages.filter(p => /<script>[^<]*menu-button/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(inline.map(p => p.slice(root.length)), [], 'inline scripts are blocked by the shell CSP; use /menu.js');
});

test('menu.js toggles the nav and stays clear of gateway path rewriting', () => {
  const src = readFileSync(join(root, 'menu.js'), 'utf8');
  assert.match(src, /classList\.toggle\('open'\)/);
  assert.match(src, /aria-expanded/);
  assert.doesNotMatch(src, /(["'`])\/(?!\/)/, 'no root-path string literals');
});
