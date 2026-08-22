import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const helperHtml = await readFile(new URL('../books/publishing/upaper/index.html', import.meta.url), 'utf8');
const helperJs = await readFile(new URL('../books/publishing/upaper/app.js', import.meta.url), 'utf8');
const desktopAgent = await readFile(new URL('../tools/books-publisher-agent/src/upaper.mjs', import.meta.url), 'utf8');
const studioHtml = await readFile(new URL('../books/publishing/studio/index.html', import.meta.url), 'utf8');

test('UPaper helper automatically distinguishes desktop and mobile environments', () => {
  assert.match(helperJs, /pointer: coarse/);
  assert.match(helperJs, /Android\|iPhone\|iPad\|Mobile/);
  assert.match(helperHtml, /웹\/PC 자동등록/);
  assert.match(helperHtml, /모바일 빠른등록/);
});

test('mobile flow provides copy share and direct CHAPTERs navigation', () => {
  assert.match(helperJs, /navigator\.clipboard/);
  assert.match(helperJs, /navigator\.share/);
  assert.match(helperHtml, /https:\/\/chapters\.upaper\.kr\//);
});

test('desktop agent prefers CHAPTERs and preserves legacy admin only as fallback', () => {
  assert.match(desktopAgent, /UPAPER_CHAPTERS = 'https:\/\/chapters\.upaper\.kr\/'/);
  assert.match(desktopAgent, /UPAPER_ADMIN = 'https:\/\/admin\.upaper\.kr\/'/);
  assert.match(desktopAgent, /surface === 'chapters'/);
  assert.match(desktopAgent, /legacy/);
});

test('financial and final publication actions remain human-confirmed', () => {
  assert.match(helperHtml, /U캐쉬 결제·최종 판매신청/);
  assert.match(desktopAgent, /최종 판매신청은 사용자가 직접 확인/);
  assert.doesNotMatch(desktopAgent, /clickText\([^\n]+\['판매신청'/);
});

test('Publishing Studio exposes the adaptive UPaper helper', () => {
  assert.match(studioHtml, /\/publishing\/upaper\//);
  assert.match(studioHtml, /유페이퍼 빠른등록/);
});
