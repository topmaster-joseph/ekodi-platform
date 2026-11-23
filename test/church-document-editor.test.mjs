import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('document HTML sanitizer strips scripts, handlers and javascript urls', async () => {
  const { sanitizeDocumentHtml } = await import('../church-reports-control.js');
  const out = sanitizeDocumentHtml('<p onclick="x()">가</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><iframe src="//x"></iframe><td style="width:20%">c</td>');
  assert.ok(!/script|onclick|javascript:|iframe/i.test(out), out);
  assert.match(out, /<p>가<\/p>/);
  assert.match(out, /style="width:20%"/);
});

test('content API keeps the previous version on every save and checks conflicts', () => {
  const js = read('church-reports-control.js');
  assert.match(js, /documents\\\/\(cdoc-\[A-Za-z0-9-\]\{1,80\}\)\\\/content\$/);
  assert.ok(js.includes("INSERT INTO church_document_revisions"));
  assert.ok(js.includes('body.baseUpdatedAt !== current.updated_at'));
  assert.ok(js.includes("'문서 편집 권한이 없습니다.'"));
  const sql = read('migrations/202611231430_church_document_contents.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS church_document_contents/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS church_document_revisions/);
  for (const id of ['00','01','02','04','06','07']) assert.ok(sql.includes(`'cdoc-2027-selfreliance-${id}'`), id);
  assert.ok(!/<script/i.test(sql));
});

test('admin documents open in an in-page editor with autosave and print', () => {
  const js = read('church-reports-admin.js');
  for (const s of ['function openDocEditor(id)', 'data-doc-edit', 'contenteditable="true"', "method:'PUT'", 'timer=setTimeout(save,2500)', 'church-doc-printing', 'function importDocHtml(sheet,html)', 'el.style.cssText=']) assert.ok(js.includes(s), s);
  const css = read('church-reports-admin.css');
  assert.ok(css.includes('.church-doc-sheet{width:210mm'));
  assert.ok(css.includes('body.church-doc-printing>*:not(#churchDocEditor){display:none!important}'));
});

test('editor wraps text inside cells and lets tables and columns be resized by dragging', () => {
  const js = read('church-reports-admin.js');
  for (const s of ['function enableTableArrows(sheet)', 'enableTableArrows(sheet);', 'function enableTableResize(sheet,onChange)', "drag={mode:'table'", "drag={mode:'col'", 'enableTableResize(sheet,'])  assert.ok(js.includes(s), s);
  const css = read('church-reports-admin.css');
  assert.ok(css.includes('white-space:normal!important'));
  assert.ok(css.includes('overflow-wrap:anywhere!important'));
  assert.ok(css.includes('cursor:col-resize!important'));
});
