import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCrossrefDoi } from './crossref-adapter.js';

test('validates metadata against requested DOI', async () => {
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ message: {
    DOI: '10.1234/abc', title: ['Verified title'], published: { 'date-parts': [[2024, 1, 1]] }, publisher: 'Example'
  } }) });
  const r = await verifyCrossrefDoi('https://doi.org/10.1234/ABC', { fetcher });
  assert.equal(r.status, 'verified_metadata');
  assert.equal(r.title, 'Verified title');
  assert.equal(r.year, 2024);
});
test('rejects provider mismatch', async () => {
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ message: { DOI: '10.9999/other' } }) });
  assert.equal((await verifyCrossrefDoi('10.1234/abc', { fetcher })).status, 'provider_mismatch');
});
test('handles not found and unavailable without claiming verification', async () => {
  assert.equal((await verifyCrossrefDoi('invalid', { fetcher: () => { throw Error('should not call'); } })).status, 'invalid_doi');
  assert.equal((await verifyCrossrefDoi('10.1234/abc', { fetcher: async () => ({ status: 404, ok: false }) })).status, 'not_found');
  assert.equal((await verifyCrossrefDoi('10.1234/abc', { fetcher: async () => { throw Error('network'); } })).status, 'provider_unavailable');
});
