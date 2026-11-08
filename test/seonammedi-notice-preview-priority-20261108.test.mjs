import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');

test('notice summary preserves image preview and accessible photo count with low fetch/decode priority',()=>{
  assert.match(worker,/class="row-photo"><img src="/);
  assert.match(worker,/noticeImageUrl\(x\.imageUrls\[0\]\)/);
  assert.match(worker,/alt="" loading="lazy" decoding="async" fetchpriority="low" width="44" height="44">사진 /);
  assert.match(worker,/x\.imageUrls\.length\+'장/);
  assert.match(worker,/body\.board-notices \.row-head \.row-photo img\{width:44px;height:44px/);
  assert.match(worker,/body\.board-notices details\.notice-record>summary\.row-head \.row-photo img\{width:34px;height:34px/);
});

test('expanded originals are linked, lazy and decoded asynchronously without a lossy proxy or upload change',()=>{
  assert.match(worker,/class="notice-image-link"/);
  assert.match(worker,/aria-label="공지 첨부 이미지 원본 보기"/);
  assert.match(worker,/alt="공지 첨부사진" loading="lazy" decoding="async"/);
  assert.match(worker,/target="_blank" rel="noopener noreferrer"/);
  assert.match(worker,/x\.imageUrls\.map\(noticeImageUrl\)\.filter\(Boolean\)/);
  assert.match(worker,/function noticeImageUrl\(u\)/);
  assert.doesNotMatch(worker,/cdn-cgi\/image\//);
});
