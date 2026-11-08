import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestIssuedIds } from '../church-reports-control.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('latest issued document is chosen per type and holder by issue date, then upload time', () => {
  const rows = [
    { id: 'a', doc_type: '건강보험료 납부확인서', holder: '본인', issued_on: '2026-10-01', created_at: '2026-10-01T00:00:00Z' },
    { id: 'b', doc_type: '건강보험료 납부확인서', holder: '본인', issued_on: '2026-11-07', created_at: '2026-11-07T00:00:00Z' },
    { id: 'c', doc_type: '건강보험료 납부확인서', holder: '배우자', issued_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z' },
    { id: 'd', doc_type: '소득금액증명', holder: '본인', issued_on: '2026-11-07', created_at: '2026-11-07T01:00:00Z' },
    { id: 'e', doc_type: '소득금액증명', holder: '본인', issued_on: '2026-11-07', created_at: '2026-11-07T02:00:00Z' },
  ];
  assert.deepEqual([...latestIssuedIds(rows)].sort(), ['b', 'c', 'e']);
});

test('issued documents are private: dedicated R2 binding, admin-only routes, safe file checks', () => {
  const control = read('church-reports-control.js');
  assert.match(control, /documents\/issued/);
  assert.match(control, /ISSUED_MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(control, /issuedMagicOk\(bytes, mime\)/);
  assert.match(control, /'private, no-store, max-age=0'/);
  assert.match(control, /church\/ekodichurch\/issued\//);
  assert.match(read('wrangler.api.toml'), /binding = "CHURCH_DOCUMENT_FILES"\nbucket_name = "ekodi-storage"/);
  assert.match(read('migrations/202611072300_church_issued_documents.sql'), /CREATE TABLE IF NOT EXISTS church_issued_documents/);
  const ui = read('church-reports-admin.js');
  assert.match(ui, /발급서류 올리기/);
  assert.doesNotMatch(ui, /https:\/\/api\.ekodi\.kr\/api\/church\/admin\/reports\/documents\/issued/);
});

test('reports/documents API resolves staff through staff-access so both platform super admins get full access', () => {
  const control = read('church-reports-control.js');
  assert.match(control, /searchParams\.set\('scope', 'staff-access'\)/);
  assert.doesNotMatch(control, /searchParams\.set\('table', 'church_staff'\)/);
  const pastorApi = read('supabase/functions/church-pastor-api/index.ts');
  assert.match(pastorApi, /PERMANENT_SUPER_ADMINS\.has\(normalizedEmail\)/);
  assert.match(pastorApi, /role:'senior_pastor',active:true,source:'platform_super_admin'/);
  assert.match(pastorApi, /scope'\)==='staff-access'/);
});
