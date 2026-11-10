import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../docs/brand/studies/',import.meta.url);
const marks=['01-open-loop','02-parallel-paths','03-opposing-gates'];

test('three independent EKODI CI studies are self-contained, minimal, and not production assets',async()=>{
  for(const mark of marks){
    const source=await readFile(new URL('20261110/'+mark+'.svg',root),'utf8');
    assert.match(source,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(source,/viewBox="0 0 64 64"/);
    assert.match(source,/stroke="currentColor"/);
    assert.match(source,/title id="title"/);
    assert.match(source,/미승인/);
    assert.doesNotMatch(source,/<(?:image|foreignObject|script|text)\b/i);
    assert.doesNotMatch(source,/(?:href|xlink:href|onload|onclick)=/i);
    assert.doesNotMatch(source,/(?:®|상표등록 완료|프랜차이즈 공식|Powered by EKODI)/);
    assert.ok(source.length<2048,mark);
  }
});
test('design study explicitly preserves independent tenant and third-party mark ownership',async()=>{
  const content=await readFile(new URL('EKODI-CI-THREE-DIRECTIONS-20261110.md',root),'utf8');
  for(const token of ['#9183','#9228','/bbqcg','/cgma','/ekodichurch','/ekodimission','KIPRIS','미승인','16 / 24 / 64px','원권리자'])assert.ok(content.includes(token),token);
  for(const mark of marks)assert.ok(content.includes('20261110/'+mark+'.svg'));
  assert.match(content,/마스터 로고 강제 금지/);
  assert.match(content,/등록 확정 없이 ® 금지/);
});
