import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assessEpubcheckReport,assessAceReport,verifyFormalEpub,
} from '../scripts/verify-epub-formal-qa.mjs';

const ec=()=>({checker:{version:'5.x'},messages:[]});
const ace=()=>({
  '@type':'earl:report',
  'earl:assertedBy':{'@type':'earl:software','doap:name':'DAISY Ace'},
  'a11y-metadata':{missing:[]},
  assertions:[],
});
const preflight=async ({expected})=>({
  technicalStatus:'passed',approvedDigestMatched:true,sha256:expected.sha256,
});
async function fixture(check){
  const root=await mkdtemp(path.join(tmpdir(),'ekodi-formal-'));
  const epub=path.join(root,'frozen.epub');
  const bytes=Buffer.alloc(256,0x2e);
  await writeFile(epub,bytes);
  const expected={bookId:'BOOK-EKODI-000001',edition:'v1.7',
    sha256:createHash('sha256').update(bytes).digest('hex')};
  try{await check({epub,expected,root});}
  finally{await rm(root,{recursive:true,force:true});}
}
function reports({epubcheck=ec(),aceReport=ace(),onRun}={}){
  const calls=[];
  const runner=async (bin,args)=>{
    calls.push({bin,args});
    if(onRun)return onRun(bin,args);
    if(bin==='epubcheck')await writeFile(args[1],JSON.stringify(epubcheck));
    if(bin==='ace')await writeFile(path.join(args[1],'report.json'),JSON.stringify(aceReport));
    return {ok:true};
  };
  return {runner,calls};
}
test('valid local reports never authorize publication; edition and tools are pinned',async()=>{
  await fixture(async({epub,expected})=>{
    const {runner,calls}=reports();
    const r=await verifyFormalEpub({epub,expected,run:runner,preflight});
    assert.equal(r.technicalStatus,'passed_automated_only');
    assert.equal(r.releaseReady,false);
    assert.equal(r.sha256,expected.sha256);
    assert.equal(r.validators.epubcheck.errors,0);
    assert.equal(r.validators.ace.violations,0);
    assert.deepEqual(calls.map(c=>c.bin),['epubcheck','ace']);
    assert.equal(calls[0].args[0],'--json');
    assert.equal(calls[1].args[0],'--outdir');
    assert.equal(calls[0].args.at(-1),epub);
    assert.equal(calls[1].args.at(-1),epub);
    assert.ok(!JSON.stringify(r).includes(epub));
  });
});
test('wrong digest and missing approved digest prevent all external validator execution',async()=>{
  await fixture(async({epub,expected})=>{
    const {runner,calls}=reports();
    const wrong=await verifyFormalEpub({epub,expected:{...expected,sha256:'1'.repeat(64)},run:runner,preflight});
    assert.ok(wrong.blockers.includes('approved_digest_mismatch'));
    const missing=await verifyFormalEpub({epub,expected:{...expected,sha256:''},run:runner,preflight});
    assert.ok(missing.blockers.includes('approved_digest_required'));
    assert.equal(calls.length,0);
    assert.equal(missing.releaseReady,false);
  });
});
test('EPUBCheck failures, warnings and unrecognized messages are blocked',async()=>{
  for(const severity of ['FATAL','ERROR','WARNING','INVALID']){
    const result=assessEpubcheckReport({checker:{version:'5'},messages:[{severity}]});
    assert.ok(!result.valid||result.errors>0||result.warnings>0);
  }
  assert.equal(assessEpubcheckReport({messages:[]}).valid,false);
  await fixture(async({epub,expected})=>{
    const {runner}=reports({epubcheck:{checker:{version:'5'},messages:[{severity:'ERROR'}]}});
    const r=await verifyFormalEpub({epub,expected,run:runner,preflight});
    assert.ok(r.blockers.includes('epubcheck_errors'));
  });
});
test('Ace failed assertions block, and missing metadata remains explicit for human review',async()=>{
  const bad=ace();
  bad.assertions=[{'earl:result':{'earl:outcome':'fail'}}];
  assert.equal(assessAceReport(bad).violations,1);
  const noSchema=assessAceReport({assertions:[]});
  assert.equal(noSchema.valid,false);
  const incomplete=ace();
  incomplete['a11y-metadata'].missing=['schema:accessibilitySummary'];
  assert.deepEqual(assessAceReport(incomplete).missingMetadata,['schema:accessibilitySummary']);
  await fixture(async({epub,expected})=>{
    const {runner}=reports({aceReport:bad});
    const r=await verifyFormalEpub({epub,expected,run:runner,preflight});
    assert.ok(r.blockers.includes('ace_violations'));
  });
});
test('missing external executables or missing reports cannot be treated as successful',async()=>{
  await fixture(async({epub,expected})=>{
    const run=async bin=>bin==='epubcheck'
      ?{ok:false,reason:'validator_not_installed'}:{ok:true};
    const r=await verifyFormalEpub({epub,expected,run,preflight});
    assert.equal(r.technicalStatus,'blocked');
    assert.ok(r.blockers.includes('epubcheck_execution_failed'));
    assert.ok(r.blockers.includes('ace_report_missing_or_invalid'));
    assert.equal(r.toolErrors.epubcheck,'validator_not_installed');
  });
});
test('malformed structural evidence and modified file after validator execution block',async()=>{
  await fixture(async({epub,expected})=>{
    const {runner,calls}=reports();
    const r=await verifyFormalEpub({epub,expected,run:runner,
      preflight:async()=>({technicalStatus:'blocked',approvedDigestMatched:false})});
    assert.ok(r.blockers.includes('epub_preflight_blocked'));
    assert.equal(calls.length,0);
    const {runner:mutating}=reports({
      onRun:async(bin,args)=>{
        if(bin==='epubcheck')await writeFile(args[1],JSON.stringify(ec()));
        if(bin==='ace'){
          await writeFile(path.join(args[1],'report.json'),JSON.stringify(ace()));
          await writeFile(epub,Buffer.alloc(256,0x51));
        }
        return {ok:true};
      },
    });
    const changed=await verifyFormalEpub({epub,expected,run:mutating,preflight});
    assert.ok(changed.blockers.includes('epub_source_changed'));
    assert.equal(changed.releaseReady,false);
  });
});
