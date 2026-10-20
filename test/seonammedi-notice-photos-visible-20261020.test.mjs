import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20: notice photos were stored and loaded but HOME-IMAGERY-ONLY hid every image on
// board pages (display:none!important), so the list showed "사진 1장" with no picture.
const css=await readFile(new URL('../sites/seonammedi/public/shared-site-header.css',import.meta.url),'utf8');

test('notice photo exception exists and comes after the HOME-IMAGERY-ONLY hide block',()=>{
  const hide=css.indexOf('body.board-notices main :is(img,picture,svg,canvas,video,iframe,object,embed)');
  const allow=css.indexOf('SEONAMMEDI-NOTICE-PHOTOS-VISIBLE-001');
  assert.ok(hide>=0&&allow>hide,'exception must follow the hide block');
  for(const rule of [
    'body.board-notices main .row-head .row-photo{display:inline-flex!important}',
    'body.board-notices main .notice-record .notice-images{display:flex!important}',
    'body.board-notices main .notice-detail .notice-detail-photos{display:grid!important}',
    'body.board-notices main .notice-detail .notice-detail-photos img{display:block!important}'
  ])assert.ok(css.includes(rule),rule);
});

test('voices and finance boards keep the imagery-only policy',()=>{
  const allowBlock=css.slice(css.indexOf('SEONAMMEDI-NOTICE-PHOTOS-VISIBLE-001'));
  assert.doesNotMatch(allowBlock,/board-voices|board-finance/);
});
