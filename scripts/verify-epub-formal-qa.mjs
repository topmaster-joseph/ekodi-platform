/**
 * FORMAL-EPUB-QA-001
 * Operator-controlled, private EPUBCheck + Ace by DAISY verification.
 * Neither a signature nor an authorization to release, publish, charge, or distribute.
 * Never downloads binaries, contacts external services, or logs manuscript bytes.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectEpubMaster } from './verify-epub-master.mjs';

const DIGEST=/^[0-9a-f]{64}$/;
const MAX_EPUB=50*1024*1024;
const MAX_REPORT=3*1024*1024;
const MAX_TIMEOUT_MS=240000;
function isObject(o){return !!o && typeof o==='object'&&!Array.isArray(o);}
function numberOf(array){return Array.isArray(array)?array.length:0;}
function noSensitiveError(error){return error?.code === 'ENOENT'?'validator_not_installed':'validator_failed';}
async function digestFile(file) {
  const info=await stat(file);
  if(!info.isFile() || info.size<22 || info.size>MAX_EPUB) throw new Error('epub_source_size_invalid');
  const b=await readFile(file);
  if(b.length!==info.size) throw new Error('epub_source_changed');
  return createHash('sha256').update(b).digest('hex');
}
/** Process invocation is fixed-argument, no shell, no remote install. */
export async function runLocalValidator(executable,args,{timeoutMs=MAX_TIMEOUT_MS}={}){
  if(typeof executable!=='string'||!executable.trim()||
    /\0|\n|\r/.test(executable)) return {ok:false,reason:'validator_command_invalid'};
  return await new Promise(resolve=>{
    let settled=false;
    const finish=v=>{if(!settled){settled=true;resolve(v);}};
    let child;
    try{
      child=spawn(executable,args,{
        shell:false,windowsHide:true,stdio:'ignore',
        signal:AbortSignal.timeout(timeoutMs)
      });
    }catch(e){finish({ok:false,reason:noSensitiveError(e)});return;}
    child.once('error',e=>finish({ok:false,reason:noSensitiveError(e)}));
    child.once('close',(code,signal)=>finish({
      ok:code===0&&!signal,
      reason:code===0&&!signal?'':signal?'validator_terminated':'validator_nonzero_exit'
    }));
  });
}
export function assessEpubcheckReport(report){
  if(!isObject(report)||!isObject(report.checker)||!Array.isArray(report.messages))
    return {valid:false,errors:0,warnings:0,reason:'epubcheck_report_invalid'};
  let errors=0,warnings=0;
  for(const item of report.messages){
    const severity=String(item?.severity??'').toUpperCase();
    if(!['FATAL','ERROR','WARNING','USAGE','INFO','HINT'].includes(severity))
      return {valid:false,errors,warnings,reason:'epubcheck_severity_unrecognized'};
    if(['FATAL','ERROR','USAGE'].includes(severity))errors++;
    if(severity==='WARNING')warnings++;
  }
  return {valid:true,errors,warnings,reason:errors?'epubcheck_errors':warnings?'epubcheck_warnings':''};
}
export function assessAceReport(report){
  if(!isObject(report)||report['@type']!=='earl:report'||!Array.isArray(report.assertions)||
    !isObject(report['earl:assertedBy'])||!isObject(report['a11y-metadata'])||
    !Array.isArray(report['a11y-metadata'].missing))
    return {valid:false,violations:0,missingMetadata:[],reason:'ace_report_invalid'};
  let violations=0,invalid=false;
  function visit(node,depth){
    if(depth>6||!isObject(node)){invalid=true;return;}
    const outcome=node['earl:result']?.['earl:outcome'];
    if(outcome==='fail'||outcome==='earl:failed')violations++;
    else if(outcome!==undefined && !['pass','earl:passed','earl:inapplicable','inapplicable'].includes(outcome))
      invalid=true;
    if(node.assertions!==undefined){
      if(!Array.isArray(node.assertions)||node.assertions.length>10000){invalid=true;return;}
      for(const child of node.assertions)visit(child,depth+1);
    }
  }
  if(report.assertions.length>10000)invalid=true;
  else for(const assertion of report.assertions)visit(assertion,0);
  const missingMetadata=report['a11y-metadata'].missing.filter(x=>typeof x==='string').slice(0,30);
  return {valid:!invalid,violations,missingMetadata,
    reason:invalid?'ace_report_invalid':violations?'ace_violations':''};
}
async function readJsonBounded(file){
  const info=await stat(file);
  if(!info.isFile()||info.size<2||info.size>MAX_REPORT) throw new Error('validator_report_invalid');
  return JSON.parse(await readFile(file,'utf8'));
}
/**
 * Evidence is always advisory and releaseReady is always false.
 * Only locally installed, explicitly configured validators can be invoked.
 * run and preflight overrides exist for isolated deterministic tests only.
 */
export async function verifyFormalEpub({
  epub,expected,epubcheckBin='epubcheck',aceBin='ace',
  run=runLocalValidator, preflight=inspectEpubMaster,
}={}){
  const blockers=[], results={epubcheck:null,ace:null}, toolErrors={};
  const bookId=typeof expected?.bookId==='string'?expected.bookId:null;
  const edition=typeof expected?.edition==='string'?expected.edition:null;
  let sha256=null;
  try{
    if(!DIGEST.test(expected?.sha256||''))throw new Error('approved_digest_required');
    sha256=await digestFile(epub);
    if(sha256!==expected.sha256)throw new Error('approved_digest_mismatch');
    const structural=await preflight({file:epub,expected});
    if(structural.technicalStatus!=='passed'||structural.sha256!==sha256||
      structural.approvedDigestMatched!==true)
      throw new Error('epub_preflight_blocked');
  }catch(e){
    blockers.push(['approved_digest_required','approved_digest_mismatch','epub_preflight_blocked',
      'epub_source_size_invalid','epub_source_changed'].includes(e.message)?e.message:'epub_source_unavailable');
    return {schema:'ekodi-formal-epub-qa-v1',bookId,edition,sha256,
      technicalStatus:'blocked',blockers,validators:results,releaseReady:false,
      releaseBlockers:['human_accessibility_and_rights_review','publisher_approved_release_and_storefront_gates']};
  }
  const directory=await mkdtemp(path.join(tmpdir(),'ekodi-formal-epub-'));
  try{
    const reportPath=path.join(directory,'epubcheck.json');
    const aceDir=path.join(directory,'ace');
    await mkdir(aceDir,{mode:0o700});
    // Do not run validators concurrently against potentially mutable EPUB inputs.
    // Always check the immutable expected digest again on exit.
    const ec=await run(epubcheckBin,['--json',reportPath,epub],{timeoutMs:MAX_TIMEOUT_MS});
    if(!ec?.ok){blockers.push('epubcheck_execution_failed');toolErrors.epubcheck=ec?.reason||'validator_failed';}
    else{
      try{
        results.epubcheck=assessEpubcheckReport(await readJsonBounded(reportPath));
        if(!results.epubcheck.valid||results.epubcheck.errors||results.epubcheck.warnings)
          blockers.push(results.epubcheck.reason||'epubcheck_report_invalid');
      }catch{blockers.push('epubcheck_report_missing_or_invalid');}
    }
    const ace=await run(aceBin,['--outdir',aceDir,epub],{timeoutMs:MAX_TIMEOUT_MS});
    if(!ace?.ok){blockers.push('ace_execution_failed');toolErrors.ace=ace?.reason||'validator_failed';}
    else{
      try{
        results.ace=assessAceReport(await readJsonBounded(path.join(aceDir,'report.json')));
        if(!results.ace.valid||results.ace.violations)
          blockers.push(results.ace.reason||'ace_report_invalid');
      }catch{blockers.push('ace_report_missing_or_invalid');}
    }
    try{if(await digestFile(epub)!==sha256)blockers.push('epub_source_changed');}
    catch{blockers.push('epub_source_changed');}
  }finally{await rm(directory,{recursive:true,force:true});}
  return {schema:'ekodi-formal-epub-qa-v1',bookId,edition,sha256,
    technicalStatus:blockers.length?'blocked':'passed_automated_only',
    blockers:[...new Set(blockers)],validators:results,toolErrors,
    releaseReady:false,
    releaseBlockers:[
      'human_accessibility_and_device_review',
      'author_publisher_copyright_and_contract_signoffs',
      'same_edition_audio_master_human_listening_qa',
      'signed_books_mall_release_and_purchase_refund_E2E'
    ]};
}
async function main(args){
  const input={};
  for(let i=0;i<args.length;i+=2){
    if(!['--epub','--expect','--epubcheck-bin','--ace-bin','--out'].includes(args[i])||
      !args[i+1]||input[args[i]])throw new Error('invalid_arguments');
    input[args[i]]=args[i+1];
  }
  if(!input['--epub']||!input['--expect'])
    throw new Error('usage: --epub /private/book.epub --expect /private/frozen-edition.json [--epubcheck-bin epubcheck] [--ace-bin ace] [--out /private/report.json]');
  const statExpected=await stat(input['--expect']);
  if(statExpected.size>10240)throw new Error('expected_file_too_large');
  const expected=JSON.parse(await readFile(input['--expect'],'utf8'));
  const result=await verifyFormalEpub({
    epub:input['--epub'],expected,
    epubcheckBin:input['--epubcheck-bin']||'epubcheck',aceBin:input['--ace-bin']||'ace'
  });
  const out=JSON.stringify(result,null,2)+'\n';
  if(input['--out'])await writeFile(input['--out'],out,{flag:'wx',mode:0o600});
  else process.stdout.write(out);
  if(result.technicalStatus!=='passed_automated_only')process.exitCode=2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
  main(process.argv.slice(2)).catch(e=>{console.error('Formal EPUB QA: '+(e?.code==='ENOENT'?'source_missing':'invalid_input'));process.exitCode=2;});
