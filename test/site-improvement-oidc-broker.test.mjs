import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  SITE_IMPROVEMENT_OIDC_BROKER_POLICY,
  validateSiteImprovementOidcClaims,
  verifySiteImprovementGitHubOidc,
} from '../ekodi-site-improvement-oidc-broker.js';

const enc=new TextEncoder();
function b64url(bytes){
  return Buffer.from(bytes).toString('base64url');
}
async function signedToken(overrides={}){
  const pair=await crypto.subtle.generateKey(
    {name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
    true,
    ['sign','verify'],
  );
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  jwk.kid='test-key';
  jwk.alg='RS256';
  jwk.use='sig';
  const now=Math.floor(Date.now()/1000);
  const claims={
    iss:'https://token.actions.githubusercontent.com',
    aud:'ekodi-site-improvement',
    repository:'topmaster-joseph/ekodi-platform',
    ref:'refs/heads/main',
    workflow_ref:'topmaster-joseph/ekodi-platform/.github/workflows/site-improvement-cloud.yml@refs/heads/main',
    environment:'development',
    iat:now-5,
    nbf:now-5,
    exp:now+300,
    ...overrides,
  };
  const header=b64url(enc.encode(JSON.stringify({alg:'RS256',kid:'test-key',typ:'JWT'})));
  const payload=b64url(enc.encode(JSON.stringify(claims)));
  const input=header+'.'+payload;
  const signature=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},pair.privateKey,enc.encode(input));
  return{token:input+'.'+b64url(new Uint8Array(signature)),jwk,claims,now};
}

test('site improvement OIDC policy is pinned to the exact EKODI workflow',()=>{
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.audience,'ekodi-site-improvement');
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.repository,'topmaster-joseph/ekodi-platform');
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.ref,'refs/heads/main');
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.environment,'development');
  assert.match(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.workflowRef,/site-improvement-cloud\.yml@refs\/heads\/main$/);
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.longLivedCredentialInGitHub,false);
});

test('claim validation rejects repo, ref, workflow and stale-token drift',async()=>{
  const {claims,now}=await signedToken();
  assert.equal(validateSiteImprovementOidcClaims(claims,now).ok,true);
  assert.equal(validateSiteImprovementOidcClaims({...claims,repository:'someone/else'},now).ok,false);
  assert.equal(validateSiteImprovementOidcClaims({...claims,ref:'refs/heads/feature'},now).ok,false);
  assert.equal(validateSiteImprovementOidcClaims({...claims,workflow_ref:'topmaster-joseph/ekodi-platform/.github/workflows/other.yml@refs/heads/main'},now).ok,false);
  assert.equal(validateSiteImprovementOidcClaims({...claims,environment:'production'},now).ok,false);
  assert.equal(validateSiteImprovementOidcClaims({...claims,iat:now-2000,exp:now+10},now).ok,false);
});

test('JWT verification requires a valid GitHub-style RS256 signature',async()=>{
  const {token,jwk,now}=await signedToken();
  const verified=await verifySiteImprovementGitHubOidc(token,{jwks:[jwk],nowSeconds:now});
  assert.equal(verified.ok,true);
  const parts=token.split('.');
  const signature=parts[2];
  const badSignature=(signature[0]==='A'?'B':'A')+signature.slice(1);
  const bad=parts[0]+'.'+parts[1]+'.'+badSignature;
  await assert.rejects(()=>verifySiteImprovementGitHubOidc(bad,{jwks:[jwk],nowSeconds:now}),/signature_invalid/);
});

test('cloud workflow uses short-lived OIDC and EKODI broker instead of a GitHub OpenAI secret',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/site-improvement-cloud.yml',import.meta.url),'utf8');
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/audience=ekodi-site-improvement/);
  assert.match(workflow,/responses-api-endpoint: https:\/\/ekodi\.kr\/ai\/api\/site-improvement\/responses/);
  assert.match(workflow,/openai-api-key: \$\{\{ steps\.oidc\.outputs\.token \}\}/);
  assert.doesNotMatch(workflow,/secrets\.AI_CONTROL_OPENAI_API_KEY|secrets\.OPENAI_API_KEY/);
  assert.match(workflow,/Validate scheduler-owned inputs/);
  assert.match(workflow,/^\s*environment: development$/m);
});

test('AI worker routes broker before generic admin API authentication',async()=>{
  const worker=await readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  const broker=worker.indexOf('handleSiteImprovementResponsesBroker(request,env)');
  const generic=worker.indexOf("if(url.pathname.startsWith('/api/'))");
  assert.ok(broker>=0&&generic>=0&&broker<generic);
  assert.match(worker,/ekodi-site-improvement-oidc-broker\.js/);
});
