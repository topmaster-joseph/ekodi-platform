import test from 'node:test';
import assert from 'node:assert/strict';
import myWorker from '../my-worker.js';

async function configuration(env,path='/my/config.js'){
  const response=await myWorker.fetch(new Request('https://ekodi.kr'+path),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  const text=await response.text();
  assert.match(text,/^window\.EKODI_MY_CONFIG=/);
  return JSON.parse(text.slice('window.EKODI_MY_CONFIG='.length,-1));
}

test('points remain off even with existing production My data connection',async()=>{
  const cfg=await configuration({
    DATA_ENABLED:'true',POINTS_ENABLED:'false',DATA_MODE:'production',
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',
  });
  assert.equal(cfg.dataEnabled,true);
  assert.equal(cfg.pointsEnabled,false);
  assert.equal(cfg.dataMode,'production');
});

test('staging cannot enable points when personal data backend is isolated',async()=>{
  const cfg=await configuration({
    DATA_ENABLED:'false',POINTS_ENABLED:'true',DATA_MODE:'isolated-staging',
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',
  },'/config.js');
  assert.equal(cfg.dataEnabled,false);
  assert.equal(cfg.pointsEnabled,false);
  assert.equal(cfg.supabaseUrl,'');
  assert.equal(cfg.supabasePublishableKey,'');
});

test('points can become available only through both explicit release switches',async()=>{
  const cfg=await configuration({
    DATA_ENABLED:'true',POINTS_ENABLED:'true',
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',
  });
  assert.equal(cfg.pointsEnabled,true);
});

test('canonical points page and assets route to My, never the public digital-card short handle',async()=>{
  const requests=[];
  const env={DATA_ENABLED:'false',DATA_MODE:'isolated-staging',ASSETS:{
    fetch:async request=>{
      const path=new URL(request.url).pathname;
      requests.push(path);
      return new Response('points asset:'+path,{headers:{'content-type':'text/plain'}});
    },
  }};
  for(const path of ['/my/points/','/my/points/app.js','/my/points/styles.css']){
    const response=await myWorker.fetch(new Request('https://ekodi.kr'+path),env);
    assert.equal(response.status,200,path);
    assert.match(await response.text(),/points asset:/);
  }
  assert.deepEqual(requests,['/points/','/points/app.js','/points/styles.css']);
});
