import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('presbytery home carries the eight-menu public structure', () => {
  const home = read('sites/mokpo-presbytery/index.html');
  for (const id of ['about', 'news', 'sichal', 'departments', 'churches', 'schedule', 'library', 'workspace']) {
    assert.match(home, new RegExp(`href="#${id}"`), id);
    assert.match(home, new RegExp(`<section id="${id}"`), id);
  }
  assert.match(home, /EKODI 기반 목포노회 업무지원 시범 공간/);
  assert.match(home, /href="\/hammu\/"/);
  assert.match(home, /href="\/mokpo-presbytery\/mission\/"/);
});

test('mission page shows the 3,000,000원 draft budget as a draft', () => {
  const m = read('sites/mokpo-presbytery/mission/index.html');
  assert.match(m, /3,000,000원/);
  assert.match(m, /예산 편성\(안\)/);
  // 2026-11-06: no separate workspace — management happens inside this page after login.
  assert.match(m, /href="\/mokpo-presbytery\/mission\/viewer\/" class="cta">로그인<\/a>/);
});

test('public pages ship no scripts, contact data or roster links', () => {
  for (const p of ['sites/mokpo-presbytery/index.html', 'sites/mokpo-presbytery/mission/index.html', 'sites/mokpo-presbytery/data/churches.json']) {
    const s = read(p);
    if (p.endsWith('mission/index.html')) {
      // Only the pinned auth library and the same-origin role-panel script; never inline script.
      const scripts = [...s.matchAll(/<script[^>]*>/gi)].map(m => m[0]);
      assert.deepEqual(scripts, ['<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer>', '<script src="/mokpo-presbytery/mission/site.js" defer>'], p);
    } else assert.doesNotMatch(s, /<script/i, p);
    assert.doesNotMatch(s, /01[016789]-\d{3,4}-\d{4}/, p);
    assert.doesNotMatch(s, /\d{4}\.\d{1,2}\.\d{1,2}\)?\s*$|생년월일/m, p);
    assert.doesNotMatch(s, /href="[^"]*member/i, p);
  }
});

test('committed pages are exactly what the generator produces', () => {
  const before = [read('sites/mokpo-presbytery/index.html'), read('sites/mokpo-presbytery/mission/index.html')];
  execFileSync('python3', [new URL('../scripts/build-mokpo-presbytery-pages.py', import.meta.url).pathname]);
  const after = [read('sites/mokpo-presbytery/index.html'), read('sites/mokpo-presbytery/mission/index.html')];
  assert.deepEqual(after, before);
});
