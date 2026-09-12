import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { channelServiceBridgeReady, githubServiceClaimsAllowed, listServiceChannels, serviceModeAllowed, serviceTemplateAllowed } from '../channel-service-bridge.js';
import { uploadYoutubeVideoBytes } from '../channel-youtube-adapter.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('service bridge keeps static-token compatibility and has a pinned Mall OIDC trust boundary', () => {
  assert.equal(channelServiceBridgeReady({}), true);
  assert.equal(channelServiceBridgeReady({CHANNEL_AUTOMATION_INTERNAL_TOKEN_DEVOTION:'x'}), true);
  assert.equal(channelServiceBridgeReady({
    CHANNEL_AUTOMATION_INTERNAL_TOKEN_DEVOTION:'secret',
    CHANNEL_AUTOMATION_INTERNAL_SERVICES:'devotion',
    CHANNEL_AUTOMATION_INTERNAL_SUBJECTS:'tenant:ekodi-church',
  }), true);
  const now=Math.floor(Date.now()/1000);
  const claims={iss:'https://token.actions.githubusercontent.com',aud:'ekodi-channel-service',exp:now+300,iat:now,
    repository:'topmaster-joseph/ekodi-mall',repository_id:'1309951804',ref:'refs/heads/main',event_name:'schedule'};
  assert.equal(githubServiceClaimsAllowed(claims),true);
  assert.equal(githubServiceClaimsAllowed({...claims,repository:'other/repo'}),false);
  assert.equal(githubServiceClaimsAllowed({...claims,ref:'refs/heads/development'}),false);
  assert.equal(githubServiceClaimsAllowed({...claims,aud:'wrong-audience'}),false);
});

test('Mall OIDC is scoped only to product_short and the canonical Mall tenant', () => {
  const mall={service:'ekodi-mall',authMode:'github-oidc'};
  const subject={type:'tenant',key:'ekodimall'};
  assert.equal(serviceTemplateAllowed(mall,subject,'product_short'),true);
  assert.equal(serviceTemplateAllowed(mall,subject,'devotional_daily'),false);
  assert.equal(serviceTemplateAllowed(mall,{type:'tenant',key:'ekodi-biz'},'product_short'),false);
  assert.equal(serviceTemplateAllowed({service:'devotion',authMode:'static-token'},{type:'tenant',key:'ekodi-church'},'devotional_daily'),true);
  assert.equal(serviceTemplateAllowed({service:'devotion',authMode:'static-token'},{type:'tenant',key:'ekodi-church'},'product_short'),false);
});

test('private proof is manual-only, Mall-only and product-short-only', () => {
  const subject={type:'tenant',key:'ekodimall'};
  const manual={service:'ekodi-mall',authMode:'github-oidc',claims:{event_name:'workflow_dispatch'}};
  const scheduled={service:'ekodi-mall',authMode:'github-oidc',claims:{event_name:'schedule'}};
  const pushed={service:'ekodi-mall',authMode:'github-oidc',claims:{event_name:'push'}};
  assert.equal(serviceModeAllowed(manual,subject,'product_short','private_proof'),true);
  assert.equal(serviceModeAllowed(scheduled,subject,'product_short','private_proof'),false);
  assert.equal(serviceModeAllowed(pushed,subject,'product_short','private_proof'),false);
  assert.equal(serviceModeAllowed(manual,{type:'tenant',key:'ekodi-biz'},'product_short','private_proof'),false);
  assert.equal(serviceModeAllowed(manual,subject,'devotional_daily','private_proof'),false);
  assert.equal(serviceModeAllowed(scheduled,subject,'product_short','scheduled'),true);
});

test('service channel listing never exposes credential_ref', async () => {
  const env={CHANNEL_AUTOMATION_INTERNAL_TOKEN_DEVOTION:'secret',CHANNEL_AUTOMATION_INTERNAL_SERVICES:'devotion',CHANNEL_AUTOMATION_INTERNAL_SUBJECTS:'tenant:ekodi-church',DB:{
    prepare(){return{bind(){return{all:async()=>({results:[{id:7,provider:'youtube',channel_type:'youtube_short',display_name:'Church',external_account_id:'UC1',status:'active',config_json:'{}'}]})}}}}
  }};
  const request=new Request('https://example.test/v1/internal/channels?subject_type=tenant&subject_key=ekodi-church',{headers:{'x-ekodi-channel-service':'devotion','x-ekodi-channel-internal-token':'secret'}});
  const result=await listServiceChannels(request,env);
  assert.equal(result.status,200);
  assert.equal(result.body.authMode,'static-token');
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

test('YouTube byte adapter keeps proof uploads private without a publishAt', async () => {
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({access_token:'access'}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/youtube/v3/channels?')) return new Response(JSON.stringify({items:[{id:'UC1',snippet:{title:'Mall'}}]}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('uploadType=resumable')) return new Response('',{status:200,headers:{location:'https://upload.example/private'}});
    if(String(url)==='https://upload.example/private') return new Response(JSON.stringify({id:'private123',status:{privacyStatus:'private'}}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const result=await uploadYoutubeVideoBytes({env:{CHANNEL_GOOGLE_CLIENT_ID:'id',CHANNEL_GOOGLE_CLIENT_SECRET:'secret'},refreshToken:'refresh',bytes:new Uint8Array([1,2]),title:'Proof',description:'Private proof',privacyStatus:'private',expectedChannelId:'UC1'});
    assert.equal(result.id,'private123');
    const init=JSON.parse(calls.find(call=>call.url.includes('uploadType=resumable')).init.body);
    assert.equal(init.status.privacyStatus,'private');
    assert.equal('publishAt' in init.status,false);
  } finally { globalThis.fetch=original; }
});

test('bridge persistence is additive, central-vault only, and Mall channel selection delegates product Shorts', async () => {
  const [migration,bridge,worker,oauth]=await Promise.all([
    read('migrations/0062_channel_service_bridge.sql'),read('channel-service-bridge.js'),read('marketing-publishing-worker.js'),read('channel-oauth-control.js')
  ]);
  assert.match(migration,/channel_provider_schedules/);
  assert.doesNotMatch(migration,/(refresh_token|access_token|bearer_token)\s+TEXT/i);
  assert.match(bridge,/managedCredential/);
  assert.match(bridge,/GITHUB_AUDIENCE = 'ekodi-channel-service'/);
  assert.match(bridge,/MALL_REPOSITORY = 'topmaster-joseph\/ekodi-mall'/);
  assert.match(bridge,/MALL_REPOSITORY_ID = '1309951804'/);
  assert.match(bridge,/identity\?\.claims\?\.event_name === 'workflow_dispatch'/);
  assert.match(bridge,/provider_private_proof_uploaded/);
  assert.match(bridge,/privateProof \? 'private'/);
  assert.match(bridge,/CHANNEL_TEMPLATE_DELEGATION_REQUIRED/);
  assert.match(bridge,/CHANNEL_WORKSPACE_ID_REQUIRED/);
  assert.match(bridge,/YOUTUBE_CHANNEL_BINDING_MISMATCH/);
  assert.match(oauth,/template_id,enabled,timezone/);
  assert.match(oauth,/'product_short',1,'Asia\/Seoul'/);
  assert.match(oauth,/youtube_channel_selection/);
  assert.doesNotMatch(oauth,/my\.ekodi\.kr/);
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
