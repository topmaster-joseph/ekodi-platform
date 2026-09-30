import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeManifest } from '../tools/books-publisher-agent/src/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const googlePath = path.join(root, 'tools/books-publisher-agent/src/google-play-books.mjs');
const kdpPath = path.join(root, 'tools/books-publisher-agent/src/amazon-kdp.mjs');
const upaperPath = path.join(root, 'tools/books-publisher-agent/src/upaper.mjs');
const cliPath = path.join(root, 'tools/books-publisher-agent/src/cli.mjs');
const googleSource = fs.readFileSync(googlePath, 'utf8');
const kdpSource = fs.readFileSync(kdpPath, 'utf8');
const upaperSource = fs.readFileSync(upaperPath, 'utf8');
const cliSource = fs.readFileSync(cliPath, 'utf8');
const readme = fs.readFileSync(path.join(root, 'tools/books-publisher-agent/README.md'), 'utf8');

test('publisher agent modules pass Node syntax checks without installing Playwright', () => {
  for (const relative of [
    'tools/books-publisher-agent/src/manifest.mjs',
    'tools/books-publisher-agent/src/audit.mjs',
    'tools/books-publisher-agent/src/google-play-books.mjs',
    'tools/books-publisher-agent/src/amazon-kdp.mjs',
    'tools/books-publisher-agent/src/upaper.mjs',
    'tools/books-publisher-agent/src/cli.mjs',
  ]) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative}: ${result.stderr || result.stdout}`);
  }
});

test('publisher manifest supports GGKEY and platform disclosure metadata without credentials', () => {
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
    kdp: { aiGeneratedTranslation: true, rightsOwned: true },
  }, '/tmp/ekodi/manifest.json', { verifyFiles: false });
  assert.equal(book.bookId.mode, 'ggkey');
  assert.equal(book.price, 8900);
  assert.equal(book.currency, 'KRW');
  assert.equal(book.kdp.aiGeneratedTranslation, true);
  assert.equal(book.kdp.rightsOwned, true);
  assert.equal('password' in book, false);
  assert.equal('cookie' in book, false);
});

test('Google uses a separate persistent browser context and explicit publish approval', () => {
  assert.match(googleSource, /launchPersistentContext\(profileDir/);
  assert.match(googleSource, /channel:\s*'chrome'/);
  assert.match(googleSource, /if \(!publishApproval\)/);
  assert.match(googleSource, /publishApproval !== book\.title/);
  assert.match(cliSource, /--publish requires --approve-title/);
  assert.doesNotMatch(googleSource, /password\s*[:=]/i);
  assert.doesNotMatch(googleSource, /localStorage.*google/i);
});

test('KDP and UPaper use isolated browser profiles and stop before unsafe final attestations', () => {
  assert.match(kdpSource, /launchPersistentContext\(profileDir/);
  assert.match(upaperSource, /launchPersistentContext\(profileDir/);
  assert.match(kdpSource, /declarations_required/);
  assert.match(kdpSource, /aiGeneratedTranslation/);
  assert.match(upaperSource, /sale_application/);
  assert.match(upaperSource, /not_submitted/);
  assert.match(cliSource, /google.*kdp.*upaper/);
});

test('publisher agent blocks on missing required UI instead of guessing', () => {
  assert.match(googleSource, /status: required \? 'blocked' : 'skipped'/);
  assert.match(googleSource, /Google Play Books UI changed or action unavailable/);
  assert.match(kdpSource, /Amazon KDP UI changed or action unavailable/);
  assert.match(upaperSource, /화면이 변경되었거나 작업을 찾을 수 없습니다/);
  assert.match(readme, /No silent final publication/);
  assert.match(readme, /blocks instead of guessing/);
});
