import test from 'node:test';
import assert from 'node:assert/strict';
import {commonScriptureSnapshot, resolveCommonScripture, handlePublicCommonScripture} from '../common-scripture-registry.js';
import {EKODI_MCP_EXTENSION_TOOLS,callPublicEkodiMcpExtensionTool} from '../ekodi-mcp-external-tools.js';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('approved source of truth contains exactly October 2026 31 daily passages',()=>{
 const plan=commonScriptureSnapshot('2026-10');assert.equal(plan.id,'ekodi-common-scripture-2026-10');assert.equal(plan.status,'approved');
 assert.equal(plan.readings.length,31);
 assert.deepEqual(plan.readings.map(x=>x.date).slice(9,11),['2026-10-10','2026-10-11']);
 assert.equal(resolveCommonScripture('2026-10-10').passage,'신명기 31:1-8');
 assert.equal(resolveCommonScripture('2026-10-11').passage,'신명기 31:9-18');
 assert.equal(resolveCommonScripture('2026-10-31').passage,'고린도전서 2:6-16');
 assert.equal(resolveCommonScripture('2026-10-00').found,false);
 assert.equal(resolveCommonScripture('bad-date').found,false);
 assert.equal(resolveCommonScripture('2026-11-11').found,false);
});
test('public JSON API responds by exact day or month and rejects unknown dates',async()=>{
 const req=url=>new Request('https://ekodi.kr'+url);
 const day=await handlePublicCommonScripture(req('/api/public/scripture/common?date=2026-10-10'));
 assert.equal(day.status,200);assert.equal(day.headers.get('x-ekodi-source-of-truth'),'common-scripture-registry');
 assert.equal((await day.json()).passage,'신명기 31:1-8');
 const month=await handlePublicCommonScripture(req('/api/public/scripture/common?month=2026-10'));
 assert.equal(month.status,200);assert.equal((await month.json()).readings.length,31);
 const absent=await handlePublicCommonScripture(req('/api/public/scripture/common?date=2026-12-10'));
 assert.equal(absent.status,404);assert.equal((await absent.json()).found,false);
 assert.equal(handlePublicCommonScripture(req('/api/public/other')),null);
});
test('MCP offers public read-only approved common scripture tool',()=>{
 assert.ok(EKODI_MCP_EXTENSION_TOOLS.some(x=>x.name==='get_common_scripture'&&x.annotations.readOnlyHint));
 const call=callPublicEkodiMcpExtensionTool('get_common_scripture',{date:'2026-10-11'});
 assert.equal(call.structuredContent.passage,'신명기 31:9-18');
 const month=callPublicEkodiMcpExtensionTool('get_common_scripture',{month:'2026-10'});
 assert.equal(month.structuredContent.readings.length,31);
});
test('church and mission editors consult and enforce official reference before saving',()=>{
 for(const path of ['church-pastor-admin-page.js','workspace-admin-page.js']){
  const s=read(path);
  assert.match(s,/refreshApprovedReading/);
  assert.match(s,/api\/public\/scripture\/common\?date=/);
  assert.match(s,/canonical\.passage!==String\(/);
  assert.match(s,/scriptureField\.readOnly=date\.startsWith\('2026-10-'\)/);
 }
});
test('daily devotional registration protects the 31-day approved source and no September fallback',()=>{
 const s=read('devotional-control.js');
 assert.match(s,/COMMON_SCRIPTURE_SOURCE_MISMATCH/);
 assert.match(s,/DEFAULT_MONTH='2026-10'/);
 assert.match(s,/passages\.length!==passages\.length|body\.passages\.length!==passages\.length/);
 assert.match(s,/commonScriptureSnapshot/);
 assert.doesNotMatch(s,/passages\.length===30\?body\.passages:SEPTEMBER/);
});
