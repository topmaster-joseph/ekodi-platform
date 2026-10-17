import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handlePrivateMerchantStatus, sanitizePrivateMerchantStatus,
} from '../services/ekodipay/merchant-status-reader.js';

const uri='https://ekodi.kr/ekodipay/private/merchants/abcmerchant/status';
const merchantRow=Object.freeze({
  merchant_id:'abcmerchant',state:'verified',
  test_mid_verified:1,live_mid_verified:0,bank_verified:1,
  approved_issuer_count:2,evidence_count:3,
  mid:'MID_NEVER_EXPORT',legal_entity_ref:'ENTITY_NEVER_EXPORT',
  account_last4:'4321',account_hmac_fingerprint:'FINGERPRINT_NEVER_EXPORT',
  server_secret_binding_ref:'SECRET_BINDING_NEVER_EXPORT',
  proof_ref:'PROOF_NEVER_EXPORT',buyer_email:'BUYER_NEVER_EXPORT',
});
function fixture({authenticated=true,permitted=true,row=merchantRow,dbFails=false,
  authFails=false,authorizationFails=false,invalidScope=false,workspaceId='workspace123',
  workspaceFails=false}={}) {
  const calls=[];
  const db={prepare(sql) {
    calls.push(['prepare',sql]);
    return {bind(merchantId,dbWorkspaceId) {
      calls.push(['bind',merchantId,dbWorkspaceId]);
      return {async first() {
        calls.push(['first']);
        if(dbFails)throw Error('SENSITIVE_DATABASE_FAILURE');
        return row;
      }};
    }};
  }};
  const authenticate=async()=> {
    calls.push(['authenticate']);
    if(authFails)throw Error('SENSITIVE_AUTH_FAILURE');
    return authenticated?{
      id:'customer:member_approved',kind:invalidScope?'admin':'user',
      authorityScope:invalidScope?'platform':'tenant',
      subject:{type:invalidScope?'person':'tenant',key:'merchant-site'},
    }:null;
  };
  const resolveWorkspaceId=async({principal})=> {
    calls.push(['resolveWorkspaceId',principal.id]);
    if(workspaceFails)throw Error('SENSITIVE_WORKSPACE_FAILURE');
    return workspaceId;
  };
  const authorize=async({principal,merchantId,workspaceId,capability})=> {
    calls.push(['authorize',principal.id,merchantId,workspaceId,capability]);
    if(authorizationFails)throw Error('SENSITIVE_AUTHORIZATION_FAILURE');
    return permitted;
  };
  return {calls,options:{db,authenticate,resolveWorkspaceId,authorize}};
}
const call=(opts,method='GET',url=uri)=>
  handlePrivateMerchantStatus(new Request(url,{method}),opts);

test('authenticated tenant-scoped status reader uses parameterized query and exposes only flags',async()=>{
  const f=fixture();
  const res=await call(f.options);
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'private, no-store');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.equal(res.headers.get('vary'),'Cookie, Authorization');
  const body=await res.text();
  const data=JSON.parse(body);
  assert.deepEqual(data,{
    merchantId:'abcmerchant',state:'verified',
    checks:{testMidVerified:true,liveMidVerified:false,bankOwnershipVerified:true,
      enabledIssuerCount:2,verifiedEvidenceCount:3},
    canCharge:false,readiness:'review-only-not-payment-authorization',
  });
  for(const secret of ['MID_NEVER_EXPORT','ENTITY_NEVER_EXPORT','4321',
    'FINGERPRINT_NEVER_EXPORT','SECRET_BINDING_NEVER_EXPORT',
    'PROOF_NEVER_EXPORT','BUYER_NEVER_EXPORT'])assert.ok(!body.includes(secret),secret);
  assert.ok(f.calls.some(c=>c[0]==='authorize'&&c[2]==='abcmerchant'&&c[3]==='workspace123'
    &&c[4]==='ekodipay.merchant.status.read'));
  const prepared=f.calls.find(c=>c[0]==='prepare');
  assert.ok(prepared[1].includes('WHERE m.merchant_id=?'));
  assert.ok(prepared[1].includes('w.workspace_id=?'));
  assert.ok(prepared[1].includes("w.status='active'"));
  assert.ok(prepared[1].includes('w.verified_at IS NOT NULL'));
  assert.deepEqual(f.calls.find(c=>c[0]==='bind'),['bind','abcmerchant','workspace123']);
});
test('guest or missing identity never queries merchant data',async()=>{
  const f=fixture({authenticated:false});
  assert.equal((await call(f.options)).status,401);
  assert.ok(!f.calls.some(c=>c[0]==='prepare'));
  const missing=fixture();
  const result=await call({...missing.options,authenticate:undefined});
  assert.equal(result.status,503);
  assert.ok(!missing.calls.some(c=>c[0]==='prepare'));
});
test('explicit tenant capability is required, not a truthy string or global role',async()=>{
  for(const permitted of [false,'true',1,null]) {
    const f=fixture({permitted});
    const res=await call(f.options);
    assert.equal(res.status,403);
    assert.ok(!f.calls.some(c=>c[0]==='prepare'));
  }
});
test('only a verified tenant context can read a merchant record',async()=>{
  const platform=fixture({invalidScope:true});
  assert.equal((await call(platform.options)).status,403);
  assert.ok(!platform.calls.some(c=>c[0]==='resolveWorkspaceId'));
  assert.ok(!platform.calls.some(c=>c[0]==='prepare'));
  for(const workspaceId of ['', '../another-tenant','https://fake/tenant',null]) {
    const scope=fixture({workspaceId});
    assert.equal((await call(scope.options)).status,403);
    assert.ok(!scope.calls.some(c=>c[0]==='authorize'));
    assert.ok(!scope.calls.some(c=>c[0]==='prepare'));
  }
  const lacking=fixture();
  assert.equal((await call({...lacking.options,resolveWorkspaceId:undefined})).status,503);
  assert.ok(!lacking.calls.some(c=>c[0]==='prepare'));
});
test('unknown merchant and provider errors remain private',async()=>{
  const none=await call(fixture({row:null}).options);
  assert.equal(none.status,404);
  for(const opts of [{dbFails:true},{authFails:true},{authorizationFails:true},{workspaceFails:true}]) {
    const res=await call(fixture(opts).options);
    assert.equal(res.status,503);
    const text=await res.text();
    assert.ok(!text.includes('SENSITIVE_'));
  }
});
test('nonpayment route, cross-host, mutations and unknown parameters fail closed',async()=>{
  const f=fixture();
  assert.equal(await call(f.options,'GET','https://ekodi.kr/other'),null);
  assert.equal(await call(f.options,'GET','https://ekodi.kr/ekodipay/private/merchants/ABC/status'),null);
  assert.equal((await call(f.options,'GET',uri+'?merchantId=other')).status,400);
  assert.equal((await call(f.options,'GET',uri.replace('ekodi.kr','example.com'))).status,404);
  const post=await call(f.options,'POST');
  assert.equal(post.status,405);
  assert.equal(post.headers.get('allow'),'GET, HEAD');
  assert.equal(f.calls.length,0);
});
test('HEAD has no body, while unauthorized HEAD does not leak records',async()=>{
  const res=await call(fixture().options,'HEAD');
  assert.equal(res.status,200);
  assert.equal(await res.text(),'');
  const guest=await call(fixture({authenticated:false}).options,'HEAD');
  assert.equal(guest.status,401);
  assert.equal(await guest.text(),'');
});
test('status schema handles malformed and overflow counts',()=>{
  assert.throws(()=>sanitizePrivateMerchantStatus({...merchantRow,state:'unknown'}),/invalid_merchant_state/);
  assert.throws(()=>sanitizePrivateMerchantStatus(null),/invalid_merchant_state/);
  const value=sanitizePrivateMerchantStatus({...merchantRow,approved_issuer_count:-1,evidence_count:Number.MAX_SAFE_INTEGER});
  assert.equal(value.checks.enabledIssuerCount,0);
  assert.equal(value.checks.verifiedEvidenceCount,100000);
});
