import assert from 'node:assert/strict';

// Read-only and intentionally invalid anonymous-write probes. Never create
// production posts or comments as an unauthenticated deployment canary.
const mounts=[
  'https://seonammedi.kr/board',
  'https://ekodi.kr/seonammedi/board',
];
async function probe(url,{method='GET',body}={}){
  let lastError;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await fetch(url,{
        method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
        signal:AbortSignal.timeout(12000),
      });
      const json=await response.json().catch(()=>null);
      return {status:response.status,data:json};
    }catch(e){
      lastError=e;
      if(attempt<4)await new Promise(r=>setTimeout(r,attempt*700));
    }
  }
  throw lastError;
}
async function verifyMount(mount){
  const health=await probe(mount+'/health');
  assert.equal(health.status,200,'health HTTP 200');
  assert.equal(health.data?.ok,true,'worker healthy');
  assert.equal(health.data?.discussionComments,true,'comment schema applied');
  assert.equal(health.data?.queue,'ready','durable writes ready');
  const auth=await probe(mount+'/api/auth/me');
  assert.equal(auth.status,200,'guest authentication status');
  assert.equal(auth.data?.authenticated,false,'guest remains unauthenticated');
  for(const kind of ['finance','notices']){
    const publicList=await probe(mount+'/api/'+kind);
    assert.equal(publicList.status,200,kind+' publicly visible');
    assert.equal(publicList.data?.ok,true,kind+' response valid');
    assert.ok(Array.isArray(publicList.data?.items),kind+' has public items array');
    for(const item of publicList.data.items){
      assert.equal(Object.hasOwn(item,'createdBy'),false,'private author not exposed');
      if(kind==='finance')assert.equal(Object.hasOwn(item,'evidenceStatus'),false,'internal evidence not exposed');
    }
  }
  // Sending empty payloads is side-effect-free even if an outdated worker still
  // handles the request; do not use a real canary submission without OAuth.
  for(const endpoint of [
    '/api/posts',
    '/api/posts/1/replies',
    '/api/finance/1/comments',
    '/api/notices/1/comments',
  ]){
    const denied=await probe(mount+endpoint,{method:'POST',body:{}});
    assert.equal(denied.status,401,'guest write denied: '+endpoint);
    assert.equal(denied.data?.error,'login_required','guest blocked by authentication layer');
  }
  console.log('PASS '+mount+' — public reads, private metadata, guest 401, database health');
}
for(const mount of mounts)await verifyMount(mount);
console.log('EKODI independent board production authorization smoke verified.');
