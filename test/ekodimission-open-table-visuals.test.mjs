import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl=new URL('../space/ekodimission-open-table-apply.page',import.meta.url);

test('Open Table event page keeps both stick-figure visuals and the sharing-market purpose',async()=>{
  const page=await readFile(pageUrl,'utf8');
  assert.match(page,/열린식탁 스틱맨 일러스트/);
  assert.match(page,/나눔마켓 스틱맨 일러스트/);
  assert.match(page,/무료로 기부받아 저렴하게 판매/);
  assert.match(page,/수익금은 우리 주변의 ‘빈자리’를 위한 나눔에 사용/);
  assert.match(page,/수익금 → 빈자리를 위한 나눔/);
  assert.match(page,/OPEN TABLE · SHARING MARKET/);
  const inlineSvgs=page.match(/<svg\b/g)||[];
  assert.ok(inlineSvgs.length>=2,'event page should render both inline illustrations');
});
