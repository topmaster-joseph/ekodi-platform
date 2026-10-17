import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';

// Mock ONLY the external identity resolver in this isolated Node test process.
// All intake routing, SQL persistence, validation, authorization gates, and ZIP
// upload code below are the unmodified production module.
const authFixture=String.raw\`
export async function resolveRegionalAccess(request, env, scope) {
  if (scope !== 'cheonggye-pass') throw new Error('Unexpected tenant scope');
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const subjects = {
    'fixture-owner': {ok:true,platform:true,email:'owner@example.test',role:'super_admin',capabilities:['*'],canManageAccess:true},
    'fixture-vendor-a': {ok:true,platform:false,email:'vendor-a@example.test',role:'external_vendor',capabilities:['tenant.integration.inspect'],canManageAccess:false},
    'fixture-vendor-b': {ok:true,platform:false,email:'vendor-b@example.test',role:'external_developer',capabilities:['tenant.pr.create'],canManageAccess:false},
    'fixture-viewer': {ok:true,platform:false,email:'viewer@example.test',role:'viewer',capabilities:[],canManageAccess:false},
  };
  return subjects[token] || {ok:false,status:401,code:'REGION_AUTH_REQUIRED'};
}
\`;
registerHooks({
  resolve(specifier,context,nextResolve) {
    if (specifier === './regional-access-control.js' &&
        context.parentURL?.endsWith('/cheonggyepass-vendor-intake.js')) {
      return {
        url:'data:text/javascript;charset=utf-8,'+encodeURIComponent(authFixture),
        shortCircuit:true
      };
    }
    return nextResolve(specifier,context);
  }
});
const { handleCheonggyePassVendorIntake } = await import('../cheonggyepass-vendor-intake.js');

const BASE='https://ekodi.kr/api/cheonggyepass/vendor-intake';
const idem=(v)=>'test-fixture-'+v+'-idempotency-001';
function request(path,{method='GET',actor='fixture-vendor-a',body=null,origin='https://ekodi.kr',key=null,headers={}}={}){
  const h=new Headers(headers);
  if(actor)h.set('authorization','Bearer '+actor);
  if(origin)h.set('origin',origin);
  if(method!=='GET')h.set('x-ekodi-intake-request','1');
  if(key)h.set('idempotency-key',key);
  if(body && !(body instanceof Uint8Array))h.set('content-type','application/json');
  else if(body instanceof Uint8Array)h.set('content-type','application/zip');
  return new Request(BASE+path,{method,headers:h,body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});
}
async function parsed(response){
  return {status:response.status,headers:response.headers,body:await response.json()};
}
async function fixture(){
  const sql=await readFile(new URL('../migrations/0151_cheonggyepass_vendor_intake.sql',import.meta.url),'utf8');
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  sqlite.exec(sql);
  const sqlDb={
    prepare(query){
      const statement=sqlite.prepare(query);
      return {
        bind(...argumentsList){
          return {
            async run(){
              const output=statement.run(...argumentsList);
              return {meta:{changes:Number(output.changes||0)}};
            },
            async all(){return {results:statement.all(...argumentsList)}},
            async first(){return statement.get(...argumentsList)||null},
          };
        },
      };
    },
    async batch(queries){
      sqlite.exec('BEGIN');
      try{
        const outcomes=[];
        for(const query of queries)outcomes.push(await query.run());
        sqlite.exec('COMMIT');
        return outcomes;
      }catch(error){
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const quarantined=new Map();
  const r2={
    async put(key,buffer,options){
      assert.match(key,/^quarantine\/cheonggyepass\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.zip$/i);
      assert.equal(options?.customMetadata?.trust,'untrusted-never-execute');
      quarantined.set(key,new Uint8Array(buffer));
    },
    async delete(key){quarantined.delete(key)},
  };
  return {env:{DB:sqlDb,PASS_VENDOR_QUARANTINE:r2},sqlite,quarantined};
}

test('complete vendor intake lifecycle: original PR, API metadata, quarantined ZIP, scoped review and immutable audit',async t=>{
  const {env,sqlite,quarantined}=await fixture();
  const invoke=async(path,options={})=>parsed(await handleCheonggyePassVendorIntake(request(path,options),env));

  try {
    await t.test('anonymous and low-permission users cannot read or submit',async()=>{
      const anonymous=await invoke('',{actor:null});
      assert.equal(anonymous.status,401);
      assert.equal(anonymous.body.code,'REGION_AUTH_REQUIRED');
      assert.equal(anonymous.headers.get('cache-control'),'private, no-store');
      const viewer=await invoke('',{actor:'fixture-viewer'});
      assert.equal(viewer.status,403);
      const invalidOrigin=await invoke('',{method:'POST',origin:'https://vendor.example',
        key:idem('origin'),body:{delivery:'zip',vendorName:'Test vendor'}});
      assert.equal(invalidOrigin.status,403);
    });

    let prId,zipId,apiId;
    await t.test('vendor A submits GitHub source and gets idempotent replays',async()=>{
      const values={
        delivery:'github_pr',vendorName:'지역 외부개발사',
        sourceUrl:'https://github.com/acme/pass-vendor/pull/24',
        sourceRef:'a'.repeat(40)
      };
      const first=await invoke('',{method:'POST',body:values,key:idem('pr')});
      assert.equal(first.status,201);
      assert.equal(first.body.next,'review');
      assert.equal(first.body.item.status,'submitted');
      prId=first.body.item.id;
      const retry=await invoke('',{method:'POST',body:values,key:idem('pr')});
      assert.equal(retry.status,200);
      assert.equal(retry.body.reused,true);
      assert.equal(retry.body.item.id,prId);
      const changed=await invoke('',{method:'POST',body:{...values,sourceRef:'b'.repeat(40)},key:idem('pr')});
      assert.equal(changed.status,409);
      assert.equal(changed.body.code,'IDEMPOTENCY_CONFLICT');
      const disallowedURL=await invoke('',{method:'POST',body:{...values,sourceUrl:'http://127.0.0.1'},key:idem('invalid')});
      assert.equal(disallowedURL.status,400);
      assert.equal(disallowedURL.body.code,'GITHUB_PR_URL_REQUIRED');
      assert.equal(sqlite.prepare("SELECT count(*) AS count FROM cheonggyepass_vendor_events WHERE submission_id=?").get(prId).count,1);
    });

    await t.test('vendor B cannot view, upload, or review vendor A entries',async()=>{
      const onlyOwn=await invoke('',{actor:'fixture-vendor-b'});
      assert.equal(onlyOwn.status,200);
      assert.deepEqual(onlyOwn.body.items,[]);
      const strangerReview=await invoke('/'+prId+'/review',{actor:'fixture-vendor-b',method:'POST',
        body:{status:'approved_for_testing',note:'External vendor trying to approve'}});
      assert.equal(strangerReview.status,403);
      const strangerUpload=await invoke('/'+prId+'/upload',{actor:'fixture-vendor-b',method:'POST',
        body:new Uint8Array([0x50,0x4b,3,4,...Array(28).fill(0)])});
      assert.equal(strangerUpload.status,403);
    });

    await t.test('external API contract is accepted without connecting to the supplied URL',async()=>{
      const next=await invoke('',{actor:'fixture-vendor-b',method:'POST',key:idem('api'),
        body:{delivery:'external_api',vendorName:'API 운영사',
          apiBaseUrl:'https://api.vendor.co.kr/v1',
          documentationUrl:'https://docs.vendor.co.kr/openapi',
          capabilities:['health','merchant-status','coupon']}});
      assert.equal(next.status,201);
      apiId=next.body.item.id;
      assert.deepEqual(next.body.item.capabilities,['health','merchant-status','coupon']);
      assert.equal(next.body.item.apiBaseUrl,'https://api.vendor.co.kr/v1');
      const disallowed=await invoke('',{actor:'fixture-vendor-b',method:'POST',key:idem('api-invalid'),
        body:{delivery:'external_api',vendorName:'API 운영사',
          apiBaseUrl:'https://127.0.0.1/api',documentationUrl:'https://docs.vendor.co.kr/openapi',
          capabilities:['health']}});
      assert.equal(disallowed.status,400);
      assert.equal(disallowed.body.code,'API_HTTPS_URL_REQUIRED');
    });

    await t.test('ZIP remains quarantined and cannot be promoted by review endpoint',async()=>{
      const receipt=await invoke('',{method:'POST',key:idem('zip'),
        body:{delivery:'zip',vendorName:'별도 소스 납품사'}});
      assert.equal(receipt.status,201);
      zipId=receipt.body.item.id;
      const premature=await invoke('/'+zipId+'/review',{actor:'fixture-owner',method:'POST',
        body:{status:'review_pending',note:'Missing archive is not verified'}});
      assert.equal(premature.status,409);
      assert.equal(premature.body.code,'INTAKE_UPLOAD_REQUIRED');

      const bytes=new Uint8Array(32);
      bytes.set([0x50,0x4b,0x03,0x04],0); // representative untrusted PK data; never extracted
      const upload=await invoke('/'+zipId+'/upload',{method:'POST',body:bytes});
      assert.equal(upload.status,201);
      assert.equal(upload.body.status,'quarantined');
      assert.equal(upload.body.scanStatus,'not_scanned');
      assert.equal(upload.body.activation,false);
      assert.equal(upload.body.size,bytes.byteLength);
      assert.equal(quarantined.size,1);
      const row=sqlite.prepare('SELECT artifact_key,artifact_sha256,status FROM cheonggyepass_vendor_submissions WHERE id=?').get(zipId);
      assert.equal(row.status,'quarantined');
      assert.equal(row.artifact_sha256,upload.body.sha256);
      assert.ok(quarantined.has(row.artifact_key));

      const duplicate=await invoke('/'+zipId+'/upload',{method:'POST',body:bytes});
      assert.equal(duplicate.status,403);
      const unsafeApprove=await invoke('/'+zipId+'/review',{actor:'fixture-owner',method:'POST',
        body:{status:'approved_for_testing',note:'Never skip independent malware scan'}});
      assert.equal(unsafeApprove.status,409);
      assert.equal(unsafeApprove.body.code,'INTAKE_SCAN_ATTESTATION_REQUIRED');
      const review=await invoke('/'+zipId+'/review',{actor:'fixture-owner',method:'POST',
        body:{status:'review_pending',note:'Stored, separate malware scan required'}});
      assert.equal(review.status,200);
      assert.equal(review.body.status,'review_pending');
      assert.equal(review.body.activation,false);
    });

    await t.test('authorized reviewer can view all vendors, reject source, and preserve audit events',async()=>{
      const reviewList=await invoke('',{actor:'fixture-owner'});
      assert.equal(reviewList.status,200);
      assert.equal(reviewList.body.canReview,true);
      assert.equal(reviewList.body.financialExecutionEnabled,false);
      assert.equal(reviewList.body.uploadEnabled,true);
      assert.equal(reviewList.body.items.length,3);
      const ids=reviewList.body.items.map(v=>v.id);
      for(const id of [prId,zipId,apiId])assert.ok(ids.includes(id));
      const reject=await invoke('/'+prId+'/review',{actor:'fixture-owner',method:'POST',
        body:{status:'rejected',note:'Only a security-reviewed commit is allowed'}});
      assert.equal(reject.status,200);
      const followup=await invoke('/'+prId+'/review',{actor:'fixture-owner',method:'POST',
        body:{status:'approved_for_testing',note:'Trying to undo rejection'}});
      assert.equal(followup.status,409);
      assert.equal(followup.body.code,'INTAKE_REVIEW_STATE_INVALID');
      const audit=sqlite.prepare('SELECT event_type FROM cheonggyepass_vendor_events WHERE submission_id=? ORDER BY created_at').all(prId);
      assert.deepEqual(audit.map(entry=>entry.event_type),['submitted','review:rejected']);
      const vendorView=await invoke('');
      assert.equal(vendorView.status,200);
      assert.equal(vendorView.body.items.length,2);
      assert.ok(vendorView.body.items.every(entry=>entry.vendorName!=='API 운영사'));
      assert.ok(!vendorView.body.items.some(entry=>'actorEmail' in entry));
    });
  }finally{sqlite.close()}
});
