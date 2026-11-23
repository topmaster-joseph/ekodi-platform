import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { officeFileToHtml } from '../church-office-import.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url));
const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

for (const ext of ['hwpx', 'docx']) {
  test(`${ext} converts to editable paragraphs and merged tables`, async () => {
    const html = await officeFileToHtml(buf(read(`test/fixtures/office/application.${ext}`)), `신청서.${ext}`);
    assert.match(html, /<table class="auto">/);
    assert.match(html, /colspan="\d"/);
    for (const s of ['노회 동반목회지원 신청서', '정찬균', '77.10.19', '17,590']) assert.ok(html.includes(s), s);
    assert.ok(!/<script|<w:|<hp:/i.test(html));
  });
}

test('unsupported formats explain what to do', async () => {
  await assert.rejects(() => officeFileToHtml(new ArrayBuffer(4), 'old.hwp'), /\.hwpx/);
  await assert.rejects(() => officeFileToHtml(new ArrayBuffer(4), 'a.pdf'), /\.docx/);
});

test('import route, upload form, signature font and login busy guard are wired', () => {
  const ctl = read('church-reports-control.js').toString();
  assert.ok(ctl.includes("import { officeFileToHtml } from './church-office-import.js';"));
  assert.ok(ctl.includes('`${PREFIX}/documents/import`'));
  assert.ok(ctl.includes("sanitizeDocumentHtml(await officeFileToHtml("));
  const ui = read('church-reports-admin.js').toString();
  assert.ok(ui.includes('id="churchDocImport"') && ui.includes('data-doc-blank'));
  const css = read('church-reports-admin.css').toString();
  assert.ok(css.includes("src:url('/church-sign.woff2')") && css.includes('.church-doc-sheet .sign{'));
  assert.ok(read('site-worker.js').toString().includes("'/church-sign.woff2'"));
  assert.ok(read('scripts/build.mjs').toString().includes("'church-sign.woff2'"));
  const auth = read('auth-site/client-auth.js').toString();
  assert.ok(auth.includes("lockLogin('',busyText)") && auth.includes("data-ekodi-login-routing"));
  const sql = read('migrations/202611231600_church_documents_sign_and_resumes.sql').toString();
  assert.ok(sql.includes('<span class="sign">정찬균</span>'));
  assert.ok(!sql.includes('정 찬 균'));
});
