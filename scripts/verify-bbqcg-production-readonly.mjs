// EKODI BBQCG read-only production canary. Never submits orders, logs in, or writes server state.
// Uses the canonical public host and guest-side admin boundary only; no synthetic role is claimed.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BBQCG_CANARY_URL='https://ekodi.kr';
const PATHS=Object.freeze([
  ['storefront','GET','/bbqcg'],
  ['standards','GET','/bbqcg/service-guide'],
  ['promise-download','GET','/bbqcg/resources/store-promise.html'],
  ['csv-download','GET','/bbqcg/resources/qcs-gms-checklist.csv'],
  ['promise-head','HEAD','/bbqcg/resources/store-promise.html'],
  ['csv-head','HEAD','/bbqcg/resources/qcs-gms-checklist.csv'],
  ['retired-route','GET','/bbqcheonggye'],
  ['admin-guest','GET','/bbqcg/admin/pos'],
  ['admin-script','GET','/store-admin.js?v=20261108-bbqcg-compact-v1'],
  ['admin-styles','GET','/store-admin.css?v=20261108-bbqcg-compact-v1']
]);
const check=(ok,why,failures)=>{if(!ok)failures.push(why);};
const safeHeader=(response,name)=>response.headers.get(name)||'';
const hasNoindex=value=>/noindex/i.test(value||'');
const is200=status=>status===200;
const decoder=new TextDecoder('utf-8');

export async function auditBbqcgProduction({fetchImpl=fetch,origin=BBQCG_CANARY_URL}={}){
  const base=new URL(origin);
  if(base.origin!==new URL(BBQCG_CANARY_URL).origin)throw new Error('BBQCG canary must use canonical production origin');
  const evidence={checkedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA||null,mode:'anonymous-read-only',origin:base.origin,records:[],ok:false};
  let circuitOpen=false;
  for(const [id,method,pathname] of PATHS){
    if(circuitOpen)break;
    const errors=[],url=new URL(pathname,base);
    let response=null,bytes=new Uint8Array(),body='';
    try{
      response=await fetchImpl(url,{method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000),
        headers:{'accept':'text/html,text/css,text/javascript,text/csv,*/*','x-ekodi-verifier':'bbqcg-read-only'}});
      bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>2000000)errors.push('response exceeds 2MB read-only limit');
      if(method!=='HEAD'&&bytes.length<=2000000)body=decoder.decode(bytes);
      if(response.status===429||response.status===503)circuitOpen=true;
    }catch(error){errors.push('network_error:'+String(error?.name||'unknown').slice(0,32));}
    const status=response?.status||0,ctype=response?safeHeader(response,'content-type'):'',
      dispo=response?safeHeader(response,'content-disposition'):'',
      robots=response?safeHeader(response,'x-robots-tag'):'',
      cache=response?safeHeader(response,'cache-control'):'',
      location=response?safeHeader(response,'location'):'';
    const record={id,method,path:pathname,status,contentType:ctype,cacheControl:cache,robots,bytes:bytes.length,checks:[],errors};
    const mark=(passed,key)=>{record.checks.push({key,passed:Boolean(passed)});check(passed,key,errors)};
    if(id==='retired-route'){
      mark(status===410,'retired-path-410');
      mark(!location,'retired-no-redirect');
      mark(hasNoindex(robots),'retired-noindex');
    }else if(id==='admin-guest'){
      const allow=[200,301,302,303,307,308,401,403].includes(status);
      mark(allow,'guest-admin-allowed-boundary');
      if(status===200){
        mark(body.includes('data-ekodi-store-brand="bbqcg"')&&body.includes('BBQ 무안청계점'),'guest-admin-correct-tenant');
        mark(hasNoindex(robots)||/meta name="robots" content="noindex/i.test(body),'guest-admin-noindex');
      }else if(status>=300&&status<400){
        let next='';try{next=new URL(location,base).pathname}catch{}
        mark(next.startsWith('/auth'),'guest-admin-canonical-auth-redirect');
      }
      record.authenticatedRoleVerified=false;
    }else if(id==='admin-script'){
      mark(is200(status)&&/javascript/.test(ctype),'admin-script-http-type');
      mark(body.includes('function mountBbqPosTabs()'),'pos-tabs-function');
      mark(body.includes('data-bbq-pos-tab')&&body.includes('posTab'),'pos-tabs-state');
      mark(body.includes("['programs'")&&body.includes("['orders'")&&body.includes("['channels'")&&body.includes("['agent'"),'pos-four-tabs');
    }else if(id==='admin-styles'){
      mark(is200(status)&&/text\/css/.test(ctype),'admin-css-http-type');
      mark(body.includes('.bbq-pos-subtabs')&&body.includes('@media(max-width:620px)'),'admin-compact-mobile-rules');
    }else if(id==='storefront'){
      mark(is200(status)&&/text\/html/.test(ctype),'storefront-200-html');
      mark(body.includes('data-store-entity="bbqcg"'),'storefront-tenant-marker');
      mark(body.includes('우리 매장의 약속과 자료실')&&body.includes('/bbqcg/service-guide'),'storefront-resources-entry');
      mark(/\/bbqcg\/assets\/site\.css\?v=[a-f0-9]{12,40}/.test(body),'storefront-fingerprinted-css');
      mark(hasNoindex(robots),'storefront-unverified-noindex');
    }else if(id==='standards'){
      mark(is200(status)&&/text\/html/.test(ctype),'service-guide-200-html');
      mark(body.includes('매장 소개 · 자료 다운로드'),'service-guide-resources');
      mark(body.includes('/bbqcg/resources/store-promise.html')&&body.includes('/bbqcg/resources/qcs-gms-checklist.csv'),'service-guide-download-links');
      mark(hasNoindex(robots),'service-guide-noindex');
    }else if(id==='promise-download'||id==='csv-download'||id.endsWith('-head')){
      const csv=id.startsWith('csv'),head=method==='HEAD';
      mark(is200(status),'resource-http-200');
      mark(ctype.includes(csv?'text/csv':'text/html'),'resource-content-type');
      mark(dispo.includes(csv?'bbqcg-qcs-gms-checklist.csv':'bbqcg-store-promise.html'),'resource-attachment-filename');
      mark(hasNoindex(robots),'resource-noindex');
      if(head)mark(bytes.length===0,'head-empty-body');
      else if(csv){
        mark(bytes.length>3&&bytes[0]===239&&bytes[1]===187&&bytes[2]===191,'csv-utf8-bom');
        mark(body.includes('구분')&&body.includes('확인 여부')&&body.includes('조치 사항'),'csv-blank-checklist-headings');
      }else mark(body.includes('좋은 한 끼를 위한 세 가지 약속')&&body.includes('BBQ 무안청계점'),'printable-promise-content');
    }
    evidence.records.push(record);
  }
  evidence.ok=evidence.records.length===PATHS.length&&evidence.records.every(record=>!record.errors.length);
  evidence.circuitOpen=circuitOpen;
  evidence.authenticatedTenantInteractionVerified=false; // needs an actual authorized tenant session
  return evidence;
}

export async function writeBbqcgEvidence(evidence,dir='artifacts/bbqcg-production-readonly'){
  await mkdir(dir,{recursive:true});
  const output=path.resolve(dir,'bbqcg-production-readonly.json');
  await writeFile(output,JSON.stringify(evidence,null,2)+'\n','utf8');
  return output;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const evidence=await auditBbqcgProduction();
    const output=await writeBbqcgEvidence(evidence);
    for(const record of evidence.records)
      console.log('[BBQCG read-only] '+record.id+' status='+record.status+' '+(record.errors.length?'FAIL '+record.errors.join(','):'PASS'));
    console.log('[BBQCG read-only] output='+output+' ok='+evidence.ok+' authenticatedRoleVerified=false');
    if(!evidence.ok)process.exitCode=1;
  }catch(error){
    const evidence={ok:false,checkedAt:new Date().toISOString(),mode:'anonymous-read-only',error:String(error?.message||error).slice(0,200)};
    await writeBbqcgEvidence(evidence);
    console.error('[BBQCG read-only] audit failed');
    process.exitCode=1;
  }
}
