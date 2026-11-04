import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrivateReleaseTestDb} from './private-release-sqlite-test-support.mjs';
import {ingestCurrentJubileeViaProtectedPublisherService} from '../publishing/jubilee-series/current-publisher-ingest-service.mjs';
const enc=s=>new TextEncoder().encode(s);
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)))
  .map(v=>v.toString(16).padStart(2,'0')).join('');
async function setup(){
  const source=new Map(),r2Items=new Map(),db=makePrivateReleaseTestDb();
  const names=[
    ['volume1/review9/manuscript.docx','review-9'],
    ['volume1/review9/reading.pdf','review-9'],
    ['volume1/review9/accessible.epub','review-9-a11y-20261102'],
    ['volume2/review10/manuscript.docx','review-10-editorial-candidate'],
    ['volume2/review10/reading.pdf','review-10-editorial-candidate'],
    ['volume2/review10/accessible.epub','review-10-editorial-a11y-candidate'],
  ];
  const files=[];
  for(const [path,edition] of names){
    const body=enc('publisher proof '+path);
    source.set('current/'+path,body);
    files.push({path,edition,sha256:await sha(body),bytes:body.length});
  }
  const manifest={
    series:'에코디 희년신학 시리즈',
    status:'EDITORIAL_AND_AUTOMATED_CHECKS_COMPLETE__AUTHENTICATED_REGISTRATION_PENDING',
    projectIds:{volume1:null,volume2:null},
    publisherIngestCompleted:false,authorFinalApproval:false,
    publisherFinalApproval:false,publicOrSaleEnabled:false,primaryFiles:files,
  };
  const manifestBytes=enc(JSON.stringify(manifest));
  const expected={schemaVersion:2,seriesId:'EKODI-JUBILEE-THEOLOGY',
    handoffId:'EJT-20261102-REVIEW9-10-A11Y-PRIVATE',
    artifactPackage:{manifestSha256:await sha(manifestBytes)},
    primaryFiles:files,
    release:{authorApproved:false,publisherApproved:false,publicCatalog:false,
      checkoutEnabled:false,saleAllowed:false,priceKrw:null,isbn:null}};
  const projectRows=new Map([
    ['희년과 하나님 나라의 회복',{id:'project-01',stage:'planning',author_user_id:'authorA'}],
    ['우리는 다시 돌아갈 수 있는가',{id:'project-02',stage:'planning',author_user_id:'authorA'}],
  ]);
  const workflow={prepare(sql){return {bind:(owner,title)=>({
    async first(){const row=projectRows.get(title);
      return row?.author_user_id===owner?row:null;}
  })};}};
  const env={
    PUBLISHING_CURRENT_INGEST_ENABLED:'true',
    PUBLISHING_JUBILEE_AUTHOR_USER_ID:'authorA',
    PUBLISHING_PRIVATE_INGEST_DB:db,PUBLISH_DB:workflow,
    PUBLISHING_CURRENT_INTAKE_INTENT:expected,
    PUBLISHING_PRIVATE_ASSETS:{
      async put(k,b,opts){if(opts?.onlyIf?.etagDoesNotMatch!=='*')throw Error('mutable');
        if(!r2Items.has(k))r2Items.set(k,new Uint8Array(b).slice());return {key:k};},
      async get(k){const b=r2Items.get(k);return b?{arrayBuffer:async()=>b.slice().buffer}:null;},
    },
    PUBLISHING_INGEST_AUTH:{verifyServiceCaller:async ctx=>ctx?.trusted?
      {authorized:true,serviceId:'publisher-private-ingestion',actorId:'publisher-agent'}:
      {authorized:false}},
  };
  const args={callerContext:{trusted:true},expected,manifestBytes,
    readAsset:async path=>source.get(path)};
  return {db,env,args,r2Items,projectRows,close:()=>db.close()};
}
const rows=async(db,table)=>(await db.prepare('SELECT COUNT(*) AS n FROM '+table).bind().first()).n;
test('verified publisher and two author-owned private projects yield durable six-object receipt',async()=>{
  const f=await setup();try{
    const first=await ingestCurrentJubileeViaProtectedPublisherService(f.env,f.args);
    assert.equal(first.privateR2ReadbackVerified,true);
    assert.equal(first.privatePublisherDbReceiptVerified,true);
    assert.equal(first.checkoutEnabled,false);
    assert.equal(f.r2Items.size,6);
    assert.equal(await rows(f.db,'publishing_private_current_receipts'),1);
    assert.equal(await rows(f.db,'publishing_private_current_audit'),1);
    const second=await ingestCurrentJubileeViaProtectedPublisherService(f.env,{
      ...f.args,expected:{schemaVersion:0,sourceRevision:'forged'}
    });
    assert.equal(second.auditId,first.auditId);
    assert.equal(await rows(f.db,'publishing_private_current_audit'),1);
  }finally{f.close();}
});
test('disabled gate, untrusted caller, or missing owner project never writes private assets',async()=>{
  const f=await setup();try{
    f.env.PUBLISHING_CURRENT_INGEST_ENABLED='false';
    await assert.rejects(ingestCurrentJubileeViaProtectedPublisherService(f.env,f.args),/feature-off/);
    f.env.PUBLISHING_CURRENT_INGEST_ENABLED='true';
    await assert.rejects(ingestCurrentJubileeViaProtectedPublisherService(f.env,{
      ...f.args,callerContext:{trusted:false}}),/service-caller-denied/);
    f.projectRows.delete('우리는 다시 돌아갈 수 있는가');
    await assert.rejects(ingestCurrentJubileeViaProtectedPublisherService(f.env,f.args),
      /registered-private-owner-project-required/);
    assert.equal(f.r2Items.size,0);
  }finally{f.close();}
});
