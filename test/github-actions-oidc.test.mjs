import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGitHubActionsOidc, EKODI_COMPLETION_OIDC_AUDIENCE } from '../github-actions-oidc.js';

const issuer='https://token.actions.githubusercontent.com';
const workflowRef='topmaster-joseph/ekodi-platform/.github/workflows/reconcile-orchestrator-completions.yml@refs/heads/main';

function b64url(value){
  return Buffer.from(value).toString('base64url');
}

function fixture(overrides={}){
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk=publicKey.export({format:'jwk'});
  Object.assign(jwk,{kid:'test-key',use:'sig',alg:'RS256'});
  const now=Math.floor(Date.now()/1000);
  const claims={
    iss:issuer,
    aud:EKODI_COMPLETION_OIDC_AUDIENCE,
    repository:'topmaster-joseph/ekodi-platform',
    ref:'refs/heads/main',
    event_name:'workflow_run',
    workflow_ref:workflowRef,
    workflow_sha:'0123456789abcdef0123456789abcdef01234567',
    run_id:'123',
    run_attempt:'1',
    actor:'github-actions',
    sub:'repo:topmaster-joseph/ekodi-platform:ref:refs/heads/main',
    nbf:now-10,
    exp:now+300,
    ...overrides,
  };
  const header={alg:'RS256',typ:'JWT',kid:'test-key'};
  const input=`${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature=sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  const token=`${input}.${signature}`;
  const fetchImpl=async inputUrl=>{
    const url=String(inputUrl);
    if(url===`${issuer}/.well-known/openid-configuration`)return new Response(JSON.stringify({issuer,jwks_uri:`${issuer}/.well-known/jwks`}),{status:200});
    if(url===`${issuer}/.well-known/jwks`)return new Response(JSON.stringify({keys:[jwk]}),{status:200});
    throw new Error('unexpected '+url);
  };
  return {token,fetchImpl};
}

test('accepts only signed GitHub Actions OIDC from canonical main reconciliation workflow',async()=>{
  const {token,fetchImpl}=fixture();
  const result=await verifyGitHubActionsOidc(token,{fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.repository,'topmaster-joseph/ekodi-platform');
  assert.equal(result.ref,'refs/heads/main');
  assert.equal(result.eventName,'workflow_run');
  assert.equal(result.workflowRef,workflowRef);
});

for(const [name,claim,value,reason] of [
  ['audience','aud','wrong-audience','audience_mismatch'],
  ['repository','repository','other/repo','repository_mismatch'],
  ['ref','ref','refs/heads/feature','main_ref_required'],
  ['event','event_name','pull_request','event_not_allowed'],
  ['workflow','workflow_ref','topmaster-joseph/ekodi-platform/.github/workflows/other.yml@refs/heads/main','workflow_not_allowed'],
]){
  test(`rejects wrong ${name}`,async()=>{
    const {token,fetchImpl}=fixture({[claim]:value});
    const result=await verifyGitHubActionsOidc(token,{fetchImpl});
    assert.equal(result.ok,false);
    assert.equal(result.reason,reason);
  });
}

test('rejects modified signature',async()=>{
  const {token,fetchImpl}=fixture();
  const [a,b,c]=token.split('.');
  // Flip a high-order signature character: the final base64url sextet can contain unused bits,
  // so replacing trailing characters may occasionally decode to the *same* signature bytes.
  const modified=`${a}.${b}.${c[0]==='A'?'B':'A'}${c.slice(1)}`;
  const result=await verifyGitHubActionsOidc(modified,{fetchImpl});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'signature_invalid');
});
