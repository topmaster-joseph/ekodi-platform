import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoi, normalizeOrcid, auditLiteratureRecords } from './literature-core.js';

test('DOI normalization rejects invalid values and normalizes resolver URLs', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1234/ABC.5'), '10.1234/abc.5');
  assert.equal(normalizeDoi('doi:10.5555/HELLO'), '10.5555/hello');
  assert.equal(normalizeDoi('not a doi'), null);
});
test('ORCID check digit validation', () => {
  assert.equal(normalizeOrcid('https://orcid.org/0000-0002-1825-0097'), '0000-0002-1825-0097');
  assert.equal(normalizeOrcid('0000-0002-1825-0098'), null);
});
test('bibliography audits duplicate DOI and never asserts publication verification', () => {
  const rows = auditLiteratureRecords([
    {doi:'10.1234/TEST', title:'Example', year:2020},
    {doi:'https://doi.org/10.1234/test', title:'Second', year:2021},
    {doi:'bad', title:'', year:0}
  ]);
  assert.equal(rows[0].status, 'pending_external_verification');
  assert.deepEqual(rows[1].issues, ['duplicate_doi']);
  assert.ok(rows[2].issues.includes('doi_missing_or_invalid'));
  assert.ok(rows[2].issues.includes('title_missing'));
  assert.ok(rows[2].issues.includes('year_unverified'));
});
