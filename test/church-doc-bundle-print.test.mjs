import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('documents bundle has a one-click print-all (PDF bundle) button', () => {
  const js = read('church-reports-admin.js');
  for (const s of ['data-doc-bundle-print', '전체 인쇄 · PDF 묶음', 'async function openBundlePrint(bundle,canWrite)', "id='churchDocBundle'",
    'church-doc-bundle-printing', 'ekodi-allow-print', '/attachment`', "import('/church-pdf.min.mjs')", "workerSrc='/church-pdf.worker.min.mjs'",
    'isEvalSupported:false', 'createImageBitmap', 'data-attach', 'data-doc-print', '인쇄 미리보기 · ']) {
    assert.ok(js.includes(s), s);
  }
  const css = read('church-reports-admin.css');
  for (const s of ['body.church-doc-bundle-printing>*:not(#churchDocBundle){display:none!important}', '.church-doc-bundle-missing{display:none!important}',
    '.church-doc-bundle-item{break-after:page', '.church-doc-attach-canvas']) {
    assert.ok(css.includes(s), s);
  }
});

test('document attachments are private R2 originals with magic-byte checks and write roles', () => {
  const api = read('church-reports-control.js');
  for (const s of ["const ATTACH_PREFIX = 'church/ekodichurch/attachments/'", 'async function putAttachment(', 'async function getAttachment(',
    'issuedMagicOk(bytes, mime)', "'church.document.attachment.upload'", "roleAllowed(sessionData, WRITE_ROLES)) return json({ error: '첨부 등록 권한이 없습니다.' }",
    "headers.set('cache-control', 'private, no-store, max-age=0')", 'attachmentType: row.attachment_type']) {
    assert.ok(api.includes(s), s);
  }
  const migration = read('migrations/202611240900_church_document_attachments.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS church_document_attachments/);
});

test('pdf.js is vendored same-origin (admin CSP is script-src self) and shipped as a public asset', () => {
  for (const f of ['church-pdf.min.mjs', 'church-pdf.worker.min.mjs', 'church-pdf-LICENSE.txt']) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
  assert.ok(read('church-pdf-LICENSE.txt').includes('Apache License'));
  const worker = read('site-worker.js');
  for (const f of ['/church-pdf.min.mjs', '/church-pdf.worker.min.mjs']) assert.ok(worker.includes(`'${f}'`), f);
  assert.ok(read('scripts/build.mjs').includes("'church-pdf.min.mjs','church-pdf.worker.min.mjs'"));
});
