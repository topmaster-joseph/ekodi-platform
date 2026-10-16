import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceController,SESSION_KEY} from '../services/independent-board/v2/citizen-controller.mjs';
const href='https://ekodi.kr/seonammedi/board/voices';
const session=JSON.stringify({access_token:'test-token',expires_at:4102444800});
test('admin calls existing protected endpoint and server denies regular users',async()=>{
  const calls=[];
  const controller=await createVoiceController({href,storage:{getItem:k=>k===SESSION_KEY?session:null},fetcher:async (url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/auth/session'))return {ok:true,json:async()=>({ok:true,authenticated:true,provider:'google'})};
    return {ok:false,status:403,json:async()=>({error:'voices_forbidden'})};
  }});
  await assert.rejects(controller.admin.list(),/admin_forbidden/);
  assert.equal(calls.at(-1).url,'/seonammedi/board/api/admin/posts');
  assert.equal(calls.at(-1).options.headers.authorization,'Bearer test-token');
});
test('admin edit and deletion only use validated numeric item identifiers',async()=>{
  const calls=[];
  const controller=await createVoiceController({href,storage:{getItem:k=>k===SESSION_KEY?session:null},fetcher:async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>url.endsWith('/auth/session')?{ok:true,authenticated:true,provider:'google'}:{ok:true}};
  }});
  await assert.rejects(controller.admin.remove(-1),/invalid_post/);
  await controller.admin.update(17,'corrected');
  await controller.admin.remove(17);
  const mutations=calls.filter(x=>x.url.endsWith('/admin/posts/17'));
  assert.deepEqual(mutations.map(x=>x.options.method),['PUT','DELETE']);
  assert.equal(JSON.parse(mutations[0].options.body).message,'corrected');
});
