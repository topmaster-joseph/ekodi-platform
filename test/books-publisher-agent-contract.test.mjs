import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeManifest } from '../tools/books-publisher-agent/src/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operatorPath = path.join(root, 'tools/books-publisher-agent/src/google-play-books.mjs');
const cliPath = path.join(root, 'tools/books-publisher-agent/src/cli.mjs');
const operatorSource = fs.readFileSync(operatorPath, 'utf8');
const cliSource = fs.readFileSync(cliPath, 'utf8');
const readme = fs.readFileSync(path.join(root, 'tools/books-publisher-agent/README.md'), 'utf8');

test('publisher agent modules pass Node syntax checks without installing Playwright', () => {
  for (const relative of [
    'tools/books-publisher-agent/src/manifest.mjs',
    'tools/books-publisher-agent/src/audit.mjs',
    'tools/books-publisher-agent/src/google-play-books.mjs',
    'tools/books-publisher-agent/src/cli.mjs',
  ]) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative}: ${result.stderr || result.stdout}`);
  }
});

test('publisher manifest supports GGKEY without storing credentials', () => {
  const book = normalizeManifest({
    title: '에코디언을 찾아서',
    subtitle: '성경 속 숨겨진 하나님 백성의 진짜 모습',
    author: '정찬균',
    publisher: 'EKODI BOOKS · 에코디비즈',
    language: 'Korean',
    publicationDate: '2026-08-12',
    bookId: { mode: 'ggkey' },
    currency: 'KRW',
    price: 8900,
    territory: 'WORLD',
    epubPath: './book.epub',
    coverPath: './cover.jpg',
  }, '/tmp/ekodi/manifest.json', { verifyFiles: false });
  assert.equal(book.bookId.mode, 'ggkey');
  assert.equal(book.price, 8900);
  assert.equal(book.currency, 'KRW');
  assert.equal('password' in book, false);
  assert.equal('cookie' in book, false);
});

test('publisher agent uses a separate persistent browser context and explicit publish approval', () => {
  assert.match(operatorSource, /launchPersistentContext\(profileDir/);
  assert.match(operatorSource, /channel:\s*'chrome'/);
  assert.match(operatorSource, /if \(!publishApproval\)/);
  assert.match(operatorSource, /publishApproval !== book\.title/);
  assert.match(cliSource, /--publish requires --approve-title/);
  assert.doesNotMatch(operatorSource, /password\s*[:=]/i);
  assert.doesNotMatch(operatorSource, /localStorage.*google/i);
});

test('publisher agent blocks on missing required Google UI instead of guessing', () => {
  assert.match(operatorSource, /status: required \? 'blocked' : 'skipped'/);
  assert.match(operatorSource, /Google Play Books UI changed or action unavailable/);
  assert.match(readme, /No silent final publication/);
  assert.match(readme, /blocks instead of guessing/);
});
