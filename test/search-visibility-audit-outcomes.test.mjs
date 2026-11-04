import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../search-visibility-admin.js',import.meta.url),'utf8');

test('search visibility audit reports successes and failures separately',()=>{
  assert.match(source,/data-sv-audited>0/);
  assert.match(source,/data-sv-failed>0/);
  assert.match(source,/audits\.filter\(result=>!result\.error\)\.length/);
  assert.match(source,/audits\.filter\(result=>Boolean\(result\.error\)\)\.length/);
  assert.match(source,/if\(state\.audited\.get\(site\.url\)\?\.error\)failed\+\+;else passed\+\+;/);
  assert.match(source,/별도 호스트 제외/);
});

test('inventory refresh clears stale technical audit results',()=>{
  assert.match(source,/state\.sites=\[\.\.\.byUrl\.values\(\)\];\s*state\.audited\.clear\(\)/);
});

test('manual provider evidence is not mislabeled as actual registration or indexing',()=>{
  assert.match(source,/수동확인 '\+confirmed\+' · 그 외 '/);
  assert.match(source,/confirmed_manually/);
  assert.doesNotMatch(source,/confirmed\+'\/4 수동 확인'/);
  assert.match(source,/검색엔진 등록·색인은 공급자 근거가 필요합니다/);
});
