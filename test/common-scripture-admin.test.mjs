import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { commonScriptureMonthView, validateDraft } from '../common-scripture-control.js';

const env = { DB: { prepare() { return { bind() { return { async all() { return { results: [{ date: '2026-11-03', status: 'published' }] }; } }; } }; } } };

test('month view lists every November day with title, passage and devotion coverage', async () => {
  const view = await commonScriptureMonthView(env, '2026-11');
  assert.equal(view.id, 'ekodi-common-scripture-2026-11');
  assert.equal(view.days.length, 30);
  assert.equal(view.days[0].title, '자라게 하시는 이는 하나님');
  assert.equal(view.days[2].activity, 'override-published');
  assert.equal(view.coverage.curated + view.coverage.overrides, 30);
  assert.equal(view.approvedBy, '에코디교회 담임목사 정찬균');
});

test('draft validation: month format, day count, passage syntax, and no re-registering approved months', () => {
  const days = Array.from({ length: 31 }, (_, i) => ({ passage: `고린도전서 15:${i + 1}`, title: `t${i}` }));
  assert.equal(validateDraft({ month: '2026-11', days: days.slice(0, 30) }).error, 'month_already_registered');
  assert.equal(validateDraft({ month: '2026-13', days }).error, 'invalid_month');
  assert.deepEqual(validateDraft({ month: '2026-12', days: days.slice(0, 30) }), { error: 'day_count_mismatch', expected: 31, received: 30 });
  const bad = days.map((d, i) => (i === 4 ? { passage: '없는책 1:1', title: '' } : d));
  assert.deepEqual(validateDraft({ month: '2026-12', days: bad }), { error: 'invalid_passage', days: [5] });
  const ok = validateDraft({ month: '2026-12', days, note: '<b>메모</b>' });
  assert.equal(ok.month, '2026-12');
  assert.equal(ok.days.length, 31);
  assert.equal(ok.note, 'b메모/b');
});

test('admin menu registers 에코디 공통본문 across registry, loader, layout and routes', () => {
  const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(read('admin-menu-registry.js'), /id: 'common-scripture', group: 'services', icon: '經', labels: \{ ko: '에코디 공통본문'/);
  assert.match(read('admin-menu-registry.js'), /import\('\.\/common-scripture-admin\.js'\)/);
  assert.match(read('common-scripture-admin.js'), /new URL\('common-scripture-admin\.css',import\.meta\.url\)/);
  assert.match(read('admin-canonical-routes.js'), /'common-scripture':'services'/);
  assert.match(read('scripts/build.mjs'), /'common-scripture-admin\.css','common-scripture-admin\.js'/);
  assert.match(read('mission-control-entry-worker.js'), /path\.startsWith\('\/api\/control\/common-scripture'\)/);
  const ui = read('common-scripture-admin.js');
  assert.doesNotMatch(ui, /innerHTML=`[^`]*\$\{(?!esc\()(?:day|draft|view)\.[a-z]+\}/i, 'dynamic values must be escaped');
});
