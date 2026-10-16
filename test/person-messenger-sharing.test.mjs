import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import myWorker from '../my-worker.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function projection(context){
  const base={
    ok:true,ready:true,handle:'messenger-proof-fixture',display_name:'Messenger Proof',
    headline:'Fixture only',bio:'',links:[],phone:'',email:'',exchange_enabled:false,
    contexts:[
      {key:'ekodi',label:'EKODI',is_default:true,role_name:'',role_title:''},
      {key:'personal',label:'개인',is_default:false,role_name:'',role_title:''},
    ],
    role:null,
  };
  if(context==='personal')return {
    ...base,
    selected_context:{key:'personal',label:'개인',is_default:false},
    messengers:[{key:'wechat-personal',service:'wechat',label:'WeChat',value:'fixture_wechat_456',url:''}],
  };
  return {
    ...base,
    selected_context:{key:'ekodi',label:'EKODI',is_default:true},
    messengers:[{key:'telegram-work',service:'telegram',label:'Telegram',value:'fixture_telegram_123',url:''}],
  };
}

async function withProjection(run){
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(String(url).includes('/rest/v1/rpc/person_identity_share')){
      const payload=JSON.parse(String(options.body||'{}'));
      return new Response(JSON.stringify(projection(payload.p_context||'ekodi')),{
        status:200,headers:{'content-type':'application/json'}
      });
    }
    return original(url,options);
  };
  try{return await run()}finally{globalThis.fetch=original}
}

const env={
  DATA_ENABLED:'true',
  DATA_MODE:'isolated-staging',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'publishable-test',
};

test('messenger sharing keeps services in the private ledger and exposes only selected context values',async()=>{
  const [admin,migration]=await Promise.all([
    read('my/digital-card-admin.js'),
    read('supabase/migrations/20261008113036_person_messenger_contacts.sql'),
  ]);
  for(const service of ['wechat','whatsapp','telegram','line','kakaotalk','custom']){
    assert.match(admin,new RegExp(`['"]${service}['"]`));
    assert.match(migration,new RegExp(`['"]${service}['"]`));
  }
  assert.match(migration,/private\.person_messenger_contacts/);
  assert.match(migration,/private\.person_share_context_messengers/);
  assert.match(migration,/set_my_identity_share_config_v2/);
  assert.match(migration,/messenger_keys/);
  assert.match(migration,/url ~ '\^https:\/\/'/);
  assert.doesNotMatch(migration,/grant select[^;]*person_messenger_contacts/i);
});

test('public card renders only the active context messenger and derives safe Telegram link',async()=>{
  await withProjection(async()=>{
    const response=await myWorker.fetch(new Request('https://ekodi.kr/messenger-proof-fixture/card?context=ekodi'),env);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Telegram/);
    assert.match(html,/fixture_telegram_123/);
    assert.match(html,/https:\/\/t\.me\/fixture_telegram_123/);
    assert.doesNotMatch(html,/fixture_wechat_456/);
  });
});

test('switching share context changes messenger exposure without leaking the other context',async()=>{
  await withProjection(async()=>{
    const response=await myWorker.fetch(new Request('https://ekodi.kr/messenger-proof-fixture/card?context=personal'),env);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/WeChat/);
    assert.match(html,/fixture_wechat_456/);
    assert.doesNotMatch(html,/fixture_telegram_123/);
    assert.doesNotMatch(html,/t\.me/);
  });
});

test('QR sharing center contains only the card URL, never messenger identifiers',async()=>{
  await withProjection(async()=>{
    const response=await myWorker.fetch(new Request('https://ekodi.kr/messenger-proof-fixture/qr?context=ekodi'),env);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/messenger-proof-fixture\/card\?context=ekodi&amp;utm_source=qr/);
    assert.doesNotMatch(html,/fixture_telegram_123|fixture_wechat_456/);
  });
});
