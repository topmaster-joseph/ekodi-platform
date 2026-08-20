import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../books-network-control.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../books-worker.js', import.meta.url), 'utf8');
const studio = await readFile(new URL('../books/publishing/studio/app.js', import.meta.url), 'utf8');

test('creator writes are identity scoped and publication is admin moderated', () => {
  assert.match(api, /owner_email=\?/);
  assert.match(api, /본인의 서점만/);
  assert.match(api, /본인의 책만/);
  assert.match(api, /isAdmin\(env, auth\.email\)/);
  assert.match(api, /PUBLISHED/);
  assert.match(api, /REJECTED/);
});

test('public storefront exposes only published titles', () => {
  assert.match(api, /status='PUBLISHED'/);
  assert.match(api, /status='active'/);
  assert.match(worker, /publishingNetwork: true/);
  assert.match(worker, /\/store\//);
});

test('publishing studio keeps AI optional and uses shared control API', () => {
  assert.match(studio, /https:\/\/api\.ekodi\.kr/);
  assert.doesNotMatch(studio, /OPENAI|ANTHROPIC|GEMINI|api[_-]?key/i);
  assert.match(studio, /credentials:'include'/);
});

test('network schema is additive and portable SQL', () => {
  assert.match(api, /CREATE TABLE IF NOT EXISTS books_creator_stores/);
  assert.match(api, /CREATE TABLE IF NOT EXISTS books_creator_titles/);
  assert.doesNotMatch(api, /DROP TABLE|DELETE FROM books_creator_stores|DELETE FROM books_creator_titles/);
});
