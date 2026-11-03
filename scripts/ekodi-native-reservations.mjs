#!/usr/bin/env node
/**
 * EKODI native reservation registry executor (read-only evidence).
 * Runs under the existing EKODI GitHub Actions schedule; not ChatGPT automation.
 * This does NOT write docs, publish books, merge PRs, deploy, or certify E2E.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {collectNativePreparation} from './ekodi-native-workload-preparation.mjs';

const PROFILES=new Set(['hourly','daily','publishing','worship','all']);
const NAVER_PATH='/naver85321326d5553a0caa3a944158fc2969.html';
const NAVER_BODY='naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html';
const NAVER_ORIGIN='https://ekodichurch.kr';
const CANONICAL=new Set(['https://ekodi.kr/ekodichurch','https://ekodi.kr/ekodichurch/']);
const compact=x=>String(x??'').slice(0,120);

export function selectReservationTasks(registry,profile='hourly'){
  if(!PROFILES.has(profile))throw Error('INVALID_NATIVE_RESERVATION_PROFILE');
  if(registry?.owner!=='EKODI Orchestrator'||!Array.isArray(registry?.tasks)||
      registry.tasks.length!==5||new Set(registry.tasks.map(x=>x.id)).size!==5)
    throw Error('NATIVE_RESERVATION_REGISTRY_INVALID');
  return registry.tasks.filter(task=>
    profile==='all'||profile==='daily'||task.cronProfile===profile);
}

export function classifyChurchNaverProof({proofStatus=0,proofBody='',rootStatus=0,rootLocation=''}={}){
  const fileReady=proofStatus===200&&proofBody===NAVER_BODY;
  const redirectReady=[301,302].includes(rootStatus)&&CANONICAL.has(rootLocation);
  return {
    state:fileReady&&redirectReady?'proof_url_ready_needs_provider_confirmation':'blocked',
    proofHttpStatus:proofStatus,exactBodyMatch:fileReady,
    homeHttpStatus:rootStatus,canonicalRedirectVerified:redirectReady,
    naverOwnershipConfirmed:false,searchIndexed:false,
    reason:!fileReady?'file_must_be_200_exact_body':
      !redirectReady?'legacy_home_redirect_unverified':'naver_provider_confirmation_required'
  };
}

async function boundedPublicRequest(fetchImpl,url){
  // Only the two constant URLs on the owner's legacy church domain.
  if(url!==NAVER_ORIGIN+'/'&&url!==NAVER_ORIGIN+NAVER_PATH)
    throw Error('UNAUTHORIZED_PROBE_URL');
  const response=await fetchImpl(url,{method:'GET',redirect:'manual',
    headers:{accept:'text/plain','user-agent':'EKODI-Native-Reservation/1'},
    signal:AbortSignal.timeout(8000)});
  if(url.endsWith('.html')){
    const size=Number(response.headers?.get('content-length')||0);
    if(size>256)return {status:response.status,body:''};
    const body=await response.text();
    return {status:response.status,body:body.length<=256?body.trim():''};
  }
  return {status:response.status,location:response.headers?.get('location')||''};
}

export async function collectNativeReservations({
  registry,profile='hourly',now=new Date(),fetchImpl=fetch,preparation=null
}={}){
  const tasks=selectReservationTasks(registry,profile);
  const report={
    policyId:'EKODI-NATIVE-RESERVATIONS-20261030',owner:'EKODI Orchestrator',
    nativeScheduler:'EKODI GitHub Actions native operations watch',
    profile,recordedAt:now.toISOString(),timezone:'Asia/Seoul',
    chatgptTriggerRequired:false,chatgptReservationsPaused:true,
    productionMutations:0,externalAiCalls:0,contentPublications:0,
    executionLevel:'safe_read_only_and_draft_preparation',tasks:[]
  };
  for(const task of tasks){
    let result;
    if(task.id==='church-naver-owner'){
      try{
        const proof=await boundedPublicRequest(fetchImpl,NAVER_ORIGIN+NAVER_PATH);
        const home=await boundedPublicRequest(fetchImpl,NAVER_ORIGIN+'/');
        result=classifyChurchNaverProof({proofStatus:proof.status,proofBody:proof.body,
          rootStatus:home.status,rootLocation:home.location});
      }catch{result={state:'blocked',reason:'public_http_probe_failed',naverOwnershipConfirmed:false};}
    }else if(task.id==='social-accounts-release'){
      result={state:'monitoring_registered_e2e_unverified',reason:'authenticated_social_ui_and_exact_release_evidence_required',
        actualE2EVerified:false};
    }else if(task.id==='church-live-release'){
      result={state:'monitoring_registered_e2e_unverified',reason:'church_source_release_and_viewer_studio_e2e_required',
        actualE2EVerified:false};
    }else{
      const evidence=preparation||await collectNativePreparation({now});
      if(task.id==='church-weekly-worship'){
        result={state:'draft_preparation_only',sourceStatus:compact(evidence.church?.status),
          scheduledFor:compact(evidence.church?.scheduledFor||evidence.church?.date),
          scripture:compact(evidence.church?.scripture),
          sermonDocCreated:false,bulletinDocCreated:false,slidesCreated:false,
          ownerApproved:false,reason:compact(evidence.church?.reason||'real_worship_documents_not_verified')};
      }else{
        result={state:'draft_preparation_only',sourceStatus:compact(evidence.publishing?.status),
          month:compact(evidence.publishing?.month),
          plannedSlots:Number(evidence.publishing?.slots?.length||0),
          publishedBooksVerified:0,ownerApproved:false,
          reason:compact(evidence.publishing?.reason||'real_manuscript_and_distribution_not_verified')};
      }
    }
    report.tasks.push({id:task.id,title:task.title,issue:task.issue,
      cadence:task.frequency,executedBy:'EKODI-native-read-only',...result,
      actualWorkDelivered:false,cutoverParityVerified:false});
  }
  return report;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const option=(key,defaultValue)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.split('=').slice(1).join('=')||defaultValue;
  try{
    const registry=JSON.parse(await readFile(new URL('../config/ekodi-native-reservations.json',import.meta.url),'utf8'));
    const report=await collectNativeReservations({registry,profile:option('profile','hourly')});
    await writeFile(option('output','ekodi-native-reservations-evidence.json'),JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify({owner:report.owner,profile:report.profile,
      tasks:report.tasks.map(x=>({id:x.id,state:x.state,reason:x.reason})),
      mutatesProduction:false})+'\n');
  }catch(error){
    console.error(JSON.stringify({ok:false,reason:compact(error?.message)}));
    process.exitCode=1;
  }
}
