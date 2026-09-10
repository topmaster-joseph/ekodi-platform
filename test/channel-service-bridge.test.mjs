import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { channelServiceBridgeReady, listServiceChannels } from '../channel-service-bridge.js';
import { uploadYoutubeVideoBytes } from '../channel-youtube-adapter.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('service bridge is fail-closed without token, service and subject allowlists', () => {
  assert.equal(channelServiceBridgeReady({}), false);
  assert.equal(channelServiceBridgeReady({CHANNEL_AUTOMATION_INTERNAL_TOKEN_DEVOTION:'x'}), false);
  assert.equal(channelServiceBridgeReady({
    CHANNEL_AUTOMATION_INTERNAL_TOKEN_DEVOTION:'secret',
    CHANNEL_AUTOMATION_INTERNAL_SERVICES:'devotion',
    CHANNEL_AUTOMATION_INTERNAL_SUBJECTS:'tenant:ekodi-church',
  }), true);
});

test('service channel listing never exposes credential_ref', async () => {
  const env={CHANNEL_AUTOMATION_INTERNAL_TOKEN_DEVOTION:'secret',CHANNEL_AUTOMATION_INTERNAL_SERVICES:'devotion',CHANNEL_AUTOMATION_INTERNAL_SUBJECTS:'tenant:ekodi-church',DB:{
    prepare(){return{bind(){return{all:async()=>({results:[{id:7,provider:'youtube',channel_type:'youtube_short',display_name:'Church',external_account_id:'UC1',status:'active',config_json:'{}'}]})}}}}
  }};
  const request=new Request('https://example.test/v1/internal/channels?subject_type=tenant&subject_key=ekodi-church',{headers:{'x-ekodi-channel-service':'devotion','x-ekodi-channel-internal-token':'secret'}});
  const result=await listServiceChannels(request,env);
  assert.equal(result.status,200);
  assert.equal(result.body.channels[0].externalAccountId,'UC1');
  assert.equal('credential_ref' in result.body.channels[0],false);
});
test('YouTube byte adapter schedules through the central OAuth client without an asset URL', async () => {
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({access_token:'access'}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/youtube/v3/channels?')) return new Response(JSON.stringify({items:[{id:'UC1',snippet:{title:'Church'}}]}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('uploadType=resumable')) return new Response('',{status:200,headers:{location:'https://upload.example/session'}});
    if(String(url)==='https://upload.example/session') return new Response(JSON.stringify({id:'video123',status:{privacyStatus:'private'}}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const publishAt=new Date(Date.now()+3600000).toISOString();
    const result=await uploadYoutubeVideoBytes({env:{CHANNEL_GOOGLE_CLIENT_ID:'id',CHANNEL_GOOGLE_CLIENT_SECRET:'secret'},refreshToken:'refresh',bytes:new Uint8Array([1,2,3]),title:'Devotion',description:'Body',publishAt,expectedChannelId:'UC1'});
    assert.equal(result.id,'video123');
    assert.ok(calls.some(call=>call.url.includes('/youtube/v3/channels?')));
    const init=JSON.parse(calls.find(call=>call.url.includes('uploadType=resumable')).init.body);
    assert.equal(init.status.privacyStatus,'private');
    assert.equal(init.status.publishAt,publishAt);
    assert.equal(calls.at(-1).init.headers['content-length'],'3');
  } finally { globalThis.fetch=original; }
});

test('bridge persistence is additive and stores no provider refresh token', async () => {
  const [migration,bridge,worker]=await Promise.all([read('migrations/0062_channel_service_bridge.sql'),read('channel-service-bridge.js'),read('marketing-publishing-worker.js')]);
  assert.match(migration,/channel_provider_schedules/);
  assert.doesNotMatch(migration,/(refresh_token|access_token|bearer_token)\s+TEXT/i);
  assert.match(bridge,/managedCredential/);
  assert.match(bridge,/CHANNEL_TEMPLATE_DELEGATION_REQUIRED/);
  assert.match(bridge,/CHANNEL_AUTOMATION_INTERNAL_SUBJECTS/);
  assert.match(bridge,/CHANNEL_WORKSPACE_ID_REQUIRED/);
  assert.match(bridge,/YOUTUBE_CHANNEL_BINDING_MISMATCH/);
  assert.match(migration,/UNIQUE\(service_id, subject_type, subject_key, idempotency_key\)/);
  assert.match(worker,/\/v1\/internal\/youtube\/schedule/);
});

test('YouTube byte adapter fails closed when OAuth context is not the selected channel', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({access_token:'access'}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/youtube/v3/channels?')) return new Response(JSON.stringify({items:[{id:'UC_OTHER',snippet:{title:'Other'}}]}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    await assert.rejects(
      uploadYoutubeVideoBytes({env:{CHANNEL_GOOGLE_CLIENT_ID:'id',CHANNEL_GOOGLE_CLIENT_SECRET:'secret'},refreshToken:'refresh',bytes:new Uint8Array([1]),title:'Devotion',publishAt:new Date(Date.now()+3600000).toISOString(),expectedChannelId:'UC_EXPECTED'}),
      error => error?.code === 'YOUTUBE_CHANNEL_BINDING_MISMATCH' && error?.status === 409,
    );
  } finally { globalThis.fetch=original; }
});