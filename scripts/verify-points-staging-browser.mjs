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

function check(label,result,extra={}){
  const row={label,passed:result?.ok===true,errors:result?.pageErrors?.length??null,
    blockedMutations:result?.blockedMutations?.length??null,error:result?.error?.code||result?.error?.message||null,...extra};
  report.checks.push(row);
  console.log('[EKODI-POINTS-STAGING] '+JSON.stringify(row));
  return row.passed;
}

try{
  for(const [name,profile] of devices){
    if(target==='member'){
      const ref=`e2e/${run}-${name}`;
      const hash=String(process.env[name==='desktop'?'POINTS_E2E_MEMBER_HASH_DESKTOP':'POINTS_E2E_MEMBER_HASH_MOBILE']||'');
      if(!/^[A-Za-z0-9_-]{20,200}$/.test(hash))throw new Error('member magic-link hash missing for '+name);
      const result=await runTask({
        taskId:`points-member-${run}-${name}`,
        path:`/points/?site=${site}#ekodi_token=${hash}&ekodi_type=magiclink`,
        deviceProfile:profile,allowMutation:true,timeoutMs:110000,
        actions:[
          {type:'waitFor',selector:'#claimSection:not([hidden])',timeoutMs:15000},
          {type:'assertText',text:'활동 증빙 신청'},
          {type:'fill',selector:'#claimRef',value:ref},
          {type:'fill',selector:'#claimNote',value:'EKODI browser staging verification'},
          {type:'click',selector:'#claimSubmit'},
          {type:'waitFor',selector:'#claimList .record',timeoutMs:15000},
          {type:'assertText',text:'신청했습니다'},
          {type:'assertText',text:ref},
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
}finally{
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(`${dir}/${target}-report.json`,JSON.stringify(report,null,2));
}
if(!report.passed){console.error('[EKODI-POINTS-STAGING] FAILED '+JSON.stringify(report.error||report.checks));process.exit(1);}
console.log(`[EKODI-POINTS-STAGING] ${target} verification passed (${report.checks.length} devices)`);
