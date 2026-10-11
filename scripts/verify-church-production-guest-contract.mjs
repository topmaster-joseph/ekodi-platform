import assert from 'node:assert/strict';

const API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';
const HOME='https://ekodi.kr/ekodichurch/';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const checks=[];
async function request(label,url,init={}){
  const response=await fetch(url,{
    method:init.method||'GET',
    headers:{apikey:PUBLISHABLE_KEY,...(init.headers||{})},
    redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(18000)
  });
  if(response.status===429)throw Error(label+': HTTP 429 (Cloudflare throttle; fail closed)');
  const body=response.status===204?'':await response.text();
  checks.push({label,status:response.status,contentType:response.headers.get('content-type')||''});
  return {response,body};
}
function bodyAsJson(body,label){
  try{return JSON.parse(body);}catch{throw Error(label+': expected JSON, got '+body.slice(0,100));}
}
const worshipUrl=API+'?scope=worship-access';
const financeUrl=API+'?scope=finance-access';
const guest=await request('worship guest',worshipUrl,{headers:{Origin:HOME.slice(0,-1)}});
assert.equal(guest.response.status,401,'guest worship route must deny');
assert.equal(bodyAsJson(guest.body,'worship guest').error,'AUTH_REQUIRED');
assert.equal(guest.response.headers.get('cache-control'),'no-store');

const finance=await request('finance guest',financeUrl,{headers:{Origin:HOME.slice(0,-1)}});
assert.equal(finance.response.status,401,'guest finance route must deny');
assert.equal(bodyAsJson(finance.body,'finance guest').error,'AUTH_REQUIRED');

const foreign=await request('foreign origin worship',worshipUrl,{headers:{Origin:'https://untrusted.example'}});
assert.equal(foreign.response.status,403,'foreign Origin must deny before user lookup');
assert.equal(bodyAsJson(foreign.body,'foreign origin').error,'ORIGIN_NOT_ALLOWED');
assert.notEqual(foreign.response.headers.get('access-control-allow-origin'),'https://untrusted.example');

const options=await request('allowed preflight',worshipUrl,{
  method:'OPTIONS',headers:{Origin:'https://ekodi.kr','Access-Control-Request-Method':'GET'}
});
assert.equal(options.response.status,204,'authorized Origin OPTIONS should return 204');
assert.equal(options.response.headers.get('access-control-allow-origin'),'https://ekodi.kr');

const release=await request('Church release marker',HOME+'church-release.json');
assert.equal(release.response.status,200,'Church public release marker missing');
const marker=bodyAsJson(release.body,'Church release marker');
assert.equal(marker.sourceRepository,'topmaster-joseph/ekodi-church');
assert.match(marker.sourceSha,/^[a-f0-9]{40}$/);

const admin=await request('Church inline script',HOME+'church-worship-admin.js');
assert.equal(admin.response.status,200,'Church inline permission script missing');
assert.ok(admin.body.includes('scope=worship-access'),'Church website must call the server capability endpoint');
assert.ok(admin.body.includes('[data-church-worship-admin]'),'Church script should hide by default without capability');

console.log('EKODI_CHURCH_PRODUCTION_GUEST_PROBE='+JSON.stringify({
  checkedAt:new Date().toISOString(),
  type:'unauthenticated, read-only production contract',
  expectedStates:['401 guest worship','401 guest finance','403 foreign origin','204 canonical preflight','200 public release','200 inline js'],
  checks,
  releaseSourceSha:marker.sourceSha,
  caveat:'This does not prove an authenticated 200 or operator permission revocation.'
}));
