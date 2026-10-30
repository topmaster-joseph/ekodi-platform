import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWorshipDraftJob,executeWorshipDraftJob} from '../scripts/ekodi-native-worship-google-drafts.mjs';

const date='2026-11-01';
const folder='ekodi_church_private_folder_2026';
const job={
  jobId:'ekodi:church-weekly:'+date,serviceDate:date,
  source:{status:'approved',registryId:'ekodi-common-scripture-2026-11',scripture:'고린도전서 3:1-9'},
  content:{
    scripture:'고린도전서 3:1-9',
    sermon:'하나님의 동역자라는 말씀을 중심으로 실제 작성된 설교 초안입니다. '.repeat(5),
    bulletin:'2026년 11월 1일 주일예배 주보 초안. 기도, 찬송, 말씀, 광고, 폐회 안내.',
    slides:['에코디교회 11월 1일 주일예배','본문: 고린도전서 3:1-9','하나님이 자라게 하십니다','공동체의 묵상과 기도']
  }
};
function setup({failAt=null,folderPrivateVerified=true,grant=true}={}){
  const documents=new Map(),presentations=new Map(),files=[],events=[];
  let next=0,claimed=false;
  const ledger={
    async claim(id){events.push(['claim',id]);if(claimed)return {claimed:false};claimed=true;return{claimed:true,leaseId:'lease_123456789'};},
    async record(jobId,leaseId,item){events.push(['record',item.kind,item.state,item.fileId]);return{stored:true};},
    async finish(jobId,leaseId,receipt){events.push(['finish',receipt.approvalState]);return{stored:true};},
    async block(jobId,leaseId,reason){events.push(['block',reason]);return{stored:true};}
  };
  const authority={async verify(){events.push(['verify']);return{
    ok:grant,service:'church',role:'pastor',verifiedServerSide:true,
    verifiedFolderId:folder,folderPrivateVerified
  }}};
  const tokens={async getChurchDriveToken(){events.push(['token']);return{
    token:'test-oauth-secret-restricted',scopes:['https://www.googleapis.com/auth/drive.file']
  }}};
  const calls=[];
  async function fetchImpl(url,options){
    calls.push({url,method:options.method});
    if(failAt&&calls.length===failAt)return new Response('{}',{status:403});
    const data=options.body?JSON.parse(options.body):null;
    const ok=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
    if(url.startsWith('https://www.googleapis.com/drive/v3/files?')){
      next++;
      const id='ekodi_test_draft_'+next+'_01234567';
      const row={id,mimeType:data.mimeType,parents:data.parents};
      files.push(row);
      if(data.mimeType==='application/vnd.google-apps.document')documents.set(id,'');
      else presentations.set(id,[]);
      return ok(row);
    }
    if(url.startsWith('https://docs.googleapis.com/v1/documents/')){
      const id=url.split('/').at(-1).replace(':batchUpdate','');
      if(options.method==='POST'){documents.set(id,data.requests[0].insertText.text);return ok({replies:[]});}
      return ok({documentId:id,body:{content:[{paragraph:{elements:[{textRun:{content:documents.get(id)||''}}]}}]}});
    }
    if(url.startsWith('https://slides.googleapis.com/v1/presentations/')){
      const id=url.split('/').at(-1).replace(':batchUpdate','');
      if(options.method==='POST'){
        const texts=data.requests.filter(x=>x.insertText).map(x=>x.insertText.text);
        presentations.set(id,texts);
        return ok({replies:[]});
      }
      return ok({presentationId:id,slides:(presentations.get(id)||[]).map(text=>({
        pageElements:[{shape:{text:{textElements:[{textRun:{content:text}}]}}}]
      }))});
    }
    throw new Error('unexpected_url_'+url);
  }
  return {deps:{authority,ledger,tokens,fetchImpl},ctx:{targetChurchFolderId:folder},
    calls,events,files};
}
test('approved church source and content validation rejects wrong dates, unsupported sources and hallucinated references',()=>{
  const plan=validateWorshipDraftJob(job);
  assert.equal(plan.date,date);
  assert.equal(plan.files.length,3);
  assert.throws(()=>validateWorshipDraftJob({...job,serviceDate:'2026-11-31'}));
  assert.throws(()=>validateWorshipDraftJob({...job,source:{...job.source,status:'pending'}}));
  assert.throws(()=>validateWorshipDraftJob({...job,content:{...job.content,scripture:'다른 본문'}}));
  assert.throws(()=>validateWorshipDraftJob({...job,content:{...job.content,slides:['하나만']}}));
});
test('EKODI private draft executor creates three real API-shaped files, verifies Google readback and records each ID',async()=>{
  const x=setup();
  const outcome=await executeWorshipDraftJob(job,x.deps,x.ctx);
  assert.equal(outcome.status,'draft_ready_for_pastor_review');
  assert.equal(outcome.created,3);
  assert.equal(outcome.publicationState,'private_draft');
  assert.equal(outcome.canDisableChatgptTask,false);
  assert.equal(x.files.length,3);
  assert.ok(x.files.every(f=>f.parents.includes(folder)));
  assert.equal(x.events.filter(e=>e[0]==='record'&&e[2]==='draft_readback_verified').length,3);
  assert.equal(x.events.filter(e=>e[0]==='finish').length,1);
  assert.ok(x.calls.every(c=>c.url.startsWith('https://www.googleapis.com/')));
  assert.equal(x.calls.filter(c=>c.method==='POST').length,6);
  assert.equal(x.calls.filter(c=>c.method==='GET').length,3);
  assert.equal(x.events.findIndex(x=>x[0]==='verify')<x.events.findIndex(x=>x[0]==='claim'),true);
  assert.equal(x.events.findIndex(x=>x[0]==='claim')<x.events.findIndex(x=>x[0]==='record'),true);
  assert.ok(!JSON.stringify(outcome).includes('test-oauth-secret'));
});
test('duplicate execution cannot create more files after exclusive claim was used',async()=>{
  const x=setup();
  await executeWorshipDraftJob(job,x.deps,x.ctx);
  const second=await executeWorshipDraftJob(job,x.deps,x.ctx);
  assert.equal(second.status,'blocked');
  assert.equal(second.reason,'EXCLUSIVE_CLAIM_UNAVAILABLE');
  assert.equal(second.created,0);
  assert.equal(x.files.length,3);
});
test('server authority and private Drive folder verification block all Google calls',async()=>{
  for(const input of [{grant:false},{folderPrivateVerified:false}]){
    const x=setup(input);
    await assert.rejects(executeWorshipDraftJob(job,x.deps,x.ctx),/AUTHORIZATION|PRIVATE_FOLDER/);
    assert.equal(x.calls.length,0);
    assert.equal(x.events.some(e=>e[0]==='claim'),false);
  }
});
test('failed Google call blocks reconciliation, never auto-retries, publishes, or disables ChatGPT task',async()=>{
  const x=setup({failAt:2});
  const result=await executeWorshipDraftJob(job,x.deps,x.ctx);
  assert.equal(result.status,'blocked_reconciliation_required');
  assert.equal(result.noAutomaticRetry,true);
  assert.equal(result.canDisableChatgptTask,false);
  assert.equal(result.created,1);
  assert.equal(x.events.filter(e=>e[0]==='block').length,1);
  assert.equal(x.events.filter(e=>e[0]==='finish').length,0);
  const retry=await executeWorshipDraftJob(job,x.deps,x.ctx);
  assert.equal(retry.status,'blocked');
  assert.equal(x.files.length,1);
});
test('no auth bypass, API token leakage or direct cloud deployment in code',async()=>{
  const source=await readFile(new URL('../scripts/ekodi-native-worship-google-drafts.mjs',import.meta.url),'utf8');
  assert.match(source,/authority\.verify\(ctx,plan\)/);
  assert.match(source,/folderPrivateVerified!==true/);
  assert.match(source,/ledger\.claim\(plan\.jobId\)/);
  assert.match(source,/ledger\.record\(plan\.jobId/);
  assert.match(source,/canDisableChatgptTask:false/);
  assert.doesNotMatch(source,/api\.openai\.com|chatgpt\.com|wrangler deploy|deleteFile\(/);
});
