import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const start=src.indexOf("          if(suffix==='/board/voices'){\n            const expectedVoiceUrl=");
const end=src.indexOf("          if(suffix==='/board/finance'){",start);
assert.ok(start>=0&&end>start,'voice context restore must precede board finance and compose audit');
const restore=src.slice(start,end);
assert.ok(src.indexOf("await page.locator('body.board-voices #freshWrite').click(",end)>end,
  'compose click must be scoped to voice page only');

async function run({origin='https://seonammedi.kr',prefix='',initial='/board/notices',http=200,visible=true}={}){
  let href=origin+initial,visits=[];
  const page={
    url:()=>href,
    goto:async target=>{visits.push(target);href=target;return {ok:()=>http>=200&&http<400,status:()=>http};},
    locator:selector=>({isVisible:async()=>selector==='body.board-voices #freshWrite'&&visible})
  };
  const record={};
  let failure='';
  try{await vm.runInNewContext('(async()=>{'+restore+'})()',{suffix:'/board/voices',root:{origin,prefix},page,URL,record});}
  catch(error){failure=String(error.message||error);}
  return {visits,restored:record.voiceContextRestored||false,failure};
}

test('notice category navigation restores customer citizen voice before compose click',async()=>{
  assert.deepEqual(await run(),{visits:['https://seonammedi.kr/board/voices'],restored:true,failure:''});
});
test('canonical subpath restore targets /seonammedi/board/voices only',async()=>{
  assert.deepEqual(await run({origin:'https://ekodi.kr',prefix:'/seonammedi',initial:'/seonammedi/board/notices'}),
    {visits:['https://ekodi.kr/seonammedi/board/voices'],restored:true,failure:''});
});
test('no extra navigation when still on the correct voice surface',async()=>{
  assert.deepEqual(await run({initial:'/board/voices'}),{visits:[],restored:true,failure:''});
});
test('restore fails closed when the voice page is unavailable',async()=>{
  const result=await run({http:404});
  assert.equal(result.restored,false);
  assert.match(result.failure,/guest_voice_context_restore_http_404/);
});
test('cannot accidentally click an unrelated notices write button',async()=>{
  const result=await run({visible:false});
  assert.equal(result.restored,false);
  assert.match(result.failure,/guest_voice_context_not_restored/);
});
