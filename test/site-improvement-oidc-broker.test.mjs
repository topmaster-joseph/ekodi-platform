import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  SITE_IMPROVEMENT_OIDC_BROKER_POLICY,
  isSiteImprovementBrokerToken,
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
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.githubOidcUsedForExchangeOnly,true);
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.brokerTokenStoredAsHashOnly,true);
  assert.equal(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.brokerTokenTtlSeconds,1800);
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

test('opaque broker token matches the Codex proxy safe credential alphabet',()=>{
  const good='ekodi_'+('Ab3_-xY9'.repeat(6));
  assert.equal(isSiteImprovementBrokerToken(good),true);
  assert.equal(isSiteImprovementBrokerToken('eyJhbGciOiJSUzI1NiJ9.payload.signature'),false);
  assert.equal(isSiteImprovementBrokerToken('sk-proj-secret'),false);
  assert.match(SITE_IMPROVEMENT_OIDC_BROKER_POLICY.brokerTokenPattern,/A-Za-z0-9_-/);
});

test('cloud workflow exchanges OIDC for an opaque EKODI token before Codex',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/site-improvement-cloud.yml',import.meta.url),'utf8');
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/audience=ekodi-site-improvement/);
  assert.match(workflow,/Exchange OIDC for EKODI short-lived broker token/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ai\/api\/site-improvement\/token/);
  assert.match(workflow,/\^ekodi_\[A-Za-z0-9_-\]\{40,96\}\$/);
  assert.match(workflow,/responses-api-endpoint: https:\/\/ekodi\.kr\/ai\/api\/site-improvement\/responses/);
  assert.match(workflow,/openai-api-key: \$\{\{ steps\.broker_token\.outputs\.token \}\}/);
  assert.doesNotMatch(workflow,/openai-api-key: \$\{\{ steps\.oidc\.outputs\.token \}\}/);
  assert.match(workflow,/Revoke EKODI short-lived broker token/);
  assert.match(workflow,/site-improvement\/token\/revoke/);
  assert.doesNotMatch(workflow,/secrets\.AI_CONTROL_OPENAI_API_KEY|secrets\.OPENAI_API_KEY/);
  assert.match(workflow,/Validate scheduler-owned inputs/);
  assert.match(workflow,/\^task-\[0-9\]\{14\}-\[a-z0-9\]\{4\}\$/i);
  assert.match(workflow,/^\s*environment: development$/m);
});

test('opaque broker uses a durable short-lived hashed token ledger',async()=>{
  const [broker,migration]=await Promise.all([
    readFile(new URL('../ekodi-site-improvement-oidc-broker.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0110_site_improvement_broker_tokens.sql',import.meta.url),'utf8'),
  ]);
  assert.match(broker,/BROKER_TOKEN_TTL_SECONDS=30\*60/);
  assert.match(broker,/BROKER_TOKEN_MAX_REQUESTS=256/);
  assert.match(broker,/DELETE FROM ekodi_site_improvement_broker_tokens WHERE task_id=\?/);
  assert.match(broker,/request_count=request_count\+1/);
  assert.match(broker,/expires_at>\?/);
  assert.match(broker,/revoked_at=''/);
  assert.match(broker,/created_by!=='ekodi-site-improvement-scheduler'/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS ekodi_site_improvement_broker_tokens/);
  assert.match(migration,/token_hash TEXT PRIMARY KEY/);
  assert.doesNotMatch(migration,/raw_token|openai_api_key|oidc_token/i);
});

test('AI worker routes broker before generic admin API authentication',async()=>{
  const worker=await readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  const broker=worker.indexOf('handleSiteImprovementResponsesBroker(request,env)');
  const generic=worker.indexOf("if(url.pathname.startsWith('/api/'))");
  assert.ok(broker>=0&&generic>=0&&broker<generic);
  assert.match(worker,/ekodi-site-improvement-oidc-broker\.js/);
});
