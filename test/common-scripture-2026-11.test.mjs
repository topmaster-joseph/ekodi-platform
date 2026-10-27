import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commonScriptureSnapshot,resolveCommonScripture,handlePublicCommonScripture,registeredCommonScriptureMonths,commonScriptureRegistryId} from '../common-scripture-registry.js';
import {callPublicEkodiMcpExtensionTool} from '../ekodi-mcp-external-tools.js';

const BOOK='고린도전서';
const LAST_VERSE={3:23,4:21,5:13,6:20,7:40,8:13,9:27,10:33,11:34,12:31,13:13,14:40,15:58};
function parse(passage){
  const m=passage.match(/^고린도전서 (\d+):(\d+)-(?:(\d+):)?(\d+)$/u);assert.ok(m,passage);
  return {c1:+m[1],v1:+m[2],c2:m[3]?+m[3]:+m[1],v2:+m[4]};
}

test('November 2026 common scripture is approved, 30 days, 1 Corinthians 3:1-15:22',()=>{
  const plan=commonScriptureSnapshot('2026-11');
  assert.equal(plan.id,'ekodi-common-scripture-2026-11');
  assert.equal(plan.status,'approved');
  assert.equal(plan.readings.length,30);
  assert.equal(plan.titles.length,30);
  assert.equal(resolveCommonScripture('2026-11-01').passage,'고린도전서 3:1-9');
  assert.equal(resolveCommonScripture('2026-11-18').passage,'고린도전서 10:23-11:1');
  assert.equal(resolveCommonScripture('2026-11-24').passage,'고린도전서 12:27-13:3');
  assert.equal(resolveCommonScripture('2026-11-30').passage,'고린도전서 15:12-22');
  assert.equal(resolveCommonScripture('2026-11-01').title,'자라게 하시는 이는 하나님');
  assert.equal(resolveCommonScripture('2026-11-31').found,false);
  assert.deepEqual(registeredCommonScriptureMonths(),['2026-10','2026-11']);
  assert.equal(commonScriptureRegistryId('2026-11'),'ekodi-common-scripture-2026-11');
});

test('November readings are contiguous with no gap or overlap and continue October',()=>{
  const oct=commonScriptureSnapshot('2026-10').readings.at(-1).passage;
  assert.equal(oct,'고린도전서 2:6-16');
  let prev={c:2,v:16};
  for(const {passage} of commonScriptureSnapshot('2026-11').readings){
    assert.ok(passage.startsWith(BOOK+' '));
    const r=parse(passage);
    const expected=prev.v===LAST_VERSE[prev.c]||(prev.c===2&&prev.v===16)?{c:prev.c+1,v:1}:{c:prev.c,v:prev.v+1};
    assert.deepEqual({c:r.c1,v:r.v1},expected,passage);
    assert.ok(r.v2<=LAST_VERSE[r.c2],passage);
    prev={c:r.c2,v:r.v2};
  }
  assert.deepEqual(prev,{c:15,v:22});
});

test('Sundays of November 2026 fall on 1, 8, 15, 22, 29',()=>{
  const sundays=commonScriptureSnapshot('2026-11').readings.filter(x=>new Date(x.date+'T12:00:00+09:00').getUTCDay()===0).map(x=>x.day);
  assert.deepEqual(sundays,[1,8,15,22,29]);
});

test('public API and MCP serve November, including per-site application profile',async()=>{
  const res=await handlePublicCommonScripture(new Request('https://ekodi.kr/api/public/scripture/common?month=2026-11'));
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.readings.length,30);
  assert.ok(body.siteApplications.sites.some(x=>x.site==='ekodichurch'));
  assert.ok(body.siteApplications.sites.some(x=>x.site==='ekodimission'));
  const day=await handlePublicCommonScripture(new Request('https://ekodi.kr/api/public/scripture/common?date=2026-11-29'));
  assert.equal((await day.json()).passage,'고린도전서 15:1-11');
  assert.equal(callPublicEkodiMcpExtensionTool('get_common_scripture',{date:'2026-11-08'}).structuredContent.passage,'고린도전서 7:1-9');
});

test('devotional control resolves any registered month instead of October only',()=>{
  const s=readFileSync(new URL('../devotional-control.js',import.meta.url),'utf8');
  assert.match(s,/commonScriptureRegistryId\(month\)/);
  assert.doesNotMatch(s,/month==='2026-10'/);
});
