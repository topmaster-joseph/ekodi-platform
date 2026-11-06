// EKODI browser real-screen verification of the points staging surfaces (#6739).
// Runs inside the development GitHub environment only, against the fixed
// allowlisted staging hosts. Ephemeral credentials come from the workflow and
// are revoked by it afterwards; nothing here touches production.
//
//   POINTS_E2E_TARGET=member|admin  POINTS_E2E_RUN=<id>  node scripts/verify-points-staging-browser.mjs
import fs from 'node:fs/promises';
import {runTask} from './ekodi-background-browser-worker.mjs';

const target=String(process.env.POINTS_E2E_TARGET||'');
const run=String(process.env.POINTS_E2E_RUN||'').replace(/[^a-z0-9-]/gi,'').slice(0,40);
const site=String(process.env.POINTS_E2E_SITE||'');
if(!['member','admin'].includes(target)||!run||!/^[a-z0-9_-]{2,64}$/.test(site))throw new Error('POINTS_E2E_TARGET, POINTS_E2E_RUN and POINTS_E2E_SITE are required');
const dir='artifacts/points-staging-browser';
await fs.mkdir(dir,{recursive:true});
const report={target,run,site,checks:[],passed:false,startedAt:new Date().toISOString()};
const devices=[['desktop','desktop'],['mobile','mobile-portrait']];

// Supabase keeps only the newest magic link per user, so links are issued
// just in time for each browser run (development project only).
async function memberHash(envName){
  const base=String(process.env.POINTS_E2E_SUPABASE_URL||'');
  const key=String(process.env.POINTS_E2E_SUPABASE_SECRET||'');
  const email=String(process.env.POINTS_E2E_MEMBER_EMAIL||'');
  if(base==='https://lxcxwbdwwojjkgybbqii.supabase.co'&&key.startsWith('sb_secret_')&&email){
    const res=await fetch(base+'/auth/v1/admin/generate_link',{method:'POST',
      headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({type:'magiclink',email})});
    const body=await res.json().catch(()=>({}));
    const hash=String(body.hashed_token||body.properties?.hashed_token||'');
    if(!res.ok||!hash)throw new Error('member magic link not issued ('+res.status+')');
    console.log('::add-mask::'+hash);
    return hash;
  }
  return String(process.env[envName]||'');
}

function check(label,result,extra={}){
  const row={label,passed:result?.ok===true,errors:result?.pageErrors?.length??null,
    blockedMutations:result?.blockedMutations?.length??null,error:result?.error?.code||result?.error?.message||null,...extra};
  if(!row.passed)row.detail=JSON.stringify({code:result?.code??null,message:result?.message??null,error:result?.error,
    pageErrors:(result?.pageErrors||[]).slice(0,3),url:result?.url??result?.finalUrl??null}).slice(0,600);
  report.checks.push(row);
  console.log('[EKODI-POINTS-STAGING] '+JSON.stringify(row));
  if(!row.passed)console.log(`::error::${label}: ${row.detail}`.replace(/\r?\n/g,' '));
  return row.passed;
}

try{
  for(const [name,profile] of devices){
    if(target==='member'){
      const ref=`e2e/${run}-${name}`;
      const hash=await memberHash(name==='desktop'?'POINTS_E2E_MEMBER_HASH_DESKTOP':'POINTS_E2E_MEMBER_HASH_MOBILE');
      if(!/^[A-Za-z0-9_-]{20,200}$/.test(hash))throw new Error('member magic-link hash missing for '+name);
      const result=await runTask({
        taskId:`points-member-${run}-${name}`,
        path:`/points/?site=${site}#ekodi_token=${hash}&ekodi_type=magiclink`,
        deviceProfile:profile,allowMutation:true,timeoutMs:110000,
        actions:[
          // The member surface uses accessible tabs; a hidden claim panel is
          // not a browser-visible affordance until the member selects it.
          {type:'waitFor',selector:'#pointsTabProgress',timeoutMs:15000},
          {type:'click',selector:'#pointsTabProgress'},
          {type:'waitFor',selector:'#pointsProgressContent:not([hidden])',timeoutMs:15000},
          {type:'waitFor',selector:'#pointsWeeklySection:not([hidden])',timeoutMs:15000},
          {type:'waitFor',selector:'#pointsGoalSection:not([hidden])',timeoutMs:15000},
          {type:'assertText',text:'이번 주 검증된 참여'},
          {type:'assertText',text:'나의 성취 목표'},
          {type:'click',selector:'#pointsTabClaims'},
          {type:'waitFor',selector:'#claimSection:not([hidden])',timeoutMs:15000},
          {type:'assertText',text:'활동 증빙 신청'},
          {type:'fill',selector:'#claimRef',value:ref},
          {type:'fill',selector:'#claimNote',value:'EKODI browser staging verification'},
          {type:'click',selector:'#claimSubmit'},
          {type:'waitFor',selector:'#claimList .record',timeoutMs:15000},
          {type:'assertText',text:'신청했습니다'},
          {type:'assertText',text:ref},
          {type:'screenshot',name:`member-${name}-claim`},
          {type:'click',selector:'#pointsTabProgress'},
          {type:'waitFor',selector:'#pointsMissionList .record strong:has-text("승인 대기")',timeoutMs:15000},
          {type:'assertText',text:'승인 대기'},
          {type:'screenshot',name:`member-${name}`},
        ],
      },{artifactRoot:dir});
      check(`member-${name}-claim-submitted`,result,{ref});
    }else{
      const token=String(process.env.POINTS_E2E_ADMIN_TOKEN||'');
      if(!/^[a-f0-9]{64}$/.test(token))throw new Error('admin session token missing');
      const result=await runTask({
        taskId:`points-admin-${run}-${name}`,
        path:`/?route=points#ekodi_admin_token=${token}`,
        deviceProfile:profile,allowMutation:false,timeoutMs:110000,
        actions:[
          {type:'waitFor',selector:'#ekodiPointsAdmin',timeoutMs:15000},
          {type:'waitFor',selector:'#ekodiPointsGovernance [data-gv-claims] tbody tr',timeoutMs:15000},
          {type:'assertText',text:'사이트별 활동포인트'},
          {type:'assertText',text:'서버 검증된'},
          {type:'assertText',text:`e2e/${run}-desktop`},
          {type:'assertText',text:'활동 증빙 확인 대기'},
          {type:'screenshot',name:`admin-${name}`},
        ],
      },{artifactRoot:dir});
      check(`admin-${name}-points-console`,result);
    }
  }
  report.passed=report.checks.length===devices.length&&report.checks.every(row=>row.passed);
}catch(error){
  report.error=String(error?.code||error?.message||error).slice(0,300);
  console.log(`::error::${target} verification error: ${report.error}`.replace(/\r?\n/g,' '));
  // Read-only diagnostic: what the member actually sees (fresh single-use link).
  const diagHash=await memberHash('POINTS_E2E_MEMBER_HASH_DIAG').catch(()=>'');
  if(target==='member'&&/^[A-Za-z0-9_-]{20,200}$/.test(diagHash)){
    try{
      const diag=await runTask({
        taskId:`points-member-${run}-diag`,
        path:`/points/?site=${site}#ekodi_token=${diagHash}&ekodi_type=magiclink`,
        deviceProfile:'desktop',allowMutation:false,timeoutMs:60000,
        actions:[
          {type:'waitFor',selector:'#pointsTabProgress',timeoutMs:15000},
          {type:'click',selector:'#pointsTabProgress'},
          {type:'waitFor',selector:'#pointsProgressContent:not([hidden]), #pointsProgressNotice:has-text("확인할 수 없습니다"), #loginLink:not([hidden]), #notice:has-text("실패"), #notice:has-text("준비 중")',timeoutMs:15000},
          {type:'snapshot'},
        ],
      },{artifactRoot:dir});
      const snap=(diag?.results||[]).find(r=>r.type==='snapshot');
      console.log(`::notice::member diagnostic ok=${diag?.ok} url=${snap?.url||''} text=${String(snap?.bodyText||diag?.message||'').replace(/\s+/g,' ').slice(0,900)}`);
      console.log(`::notice::member diagnostic console=${JSON.stringify((diag?.consoleErrors||[]).slice(0,5)).slice(0,700)} http=${JSON.stringify((diag?.httpErrorResponses||[]).slice(0,5)).slice(0,500)} req=${JSON.stringify((diag?.requestFailures||[]).slice(0,5)).slice(0,500)}`);
    }catch(e){console.log(`::notice::member diagnostic failed: ${String(e?.message||e).replace(/\s+/g,' ').slice(0,400)}`);}
  }
}finally{
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(`${dir}/${target}-report.json`,JSON.stringify(report,null,2));
}
if(!report.passed){console.error('[EKODI-POINTS-STAGING] FAILED '+JSON.stringify(report.error||report.checks));process.exit(1);}
console.log(`[EKODI-POINTS-STAGING] ${target} verification passed (${report.checks.length} devices)`);
