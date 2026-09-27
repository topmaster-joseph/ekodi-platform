import siteLifecycleRegistry from './config/site-lifecycle-registry.json' with { type: 'json' };

const HOUR_MS = 60 * 60 * 1000;
const PROTECTED_FILE = /^(?:\.github\/|migrations\/|supabase\/|governance\/|deploy\/|wrangler\.|CONSTITUTION\.md$|AI_DEVELOPMENT_POLICY\.md$|AGENTS(?:\.override)?\.md$)|(?:^|\/)(?:auth|oauth|billing|payment|payments|finance|money|credential|credentials|secret|secrets|security)(?:[./_-]|$)/i;
const SAFE_CONCLUSIONS = new Set(['success','neutral','skipped']);

function clean(value,max=500){return String(value??'').trim().slice(0,max)}
function integer(value,fallback,min,max){const n=Number.parseInt(value,10);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function kstDay(value=new Date()){const date=value instanceof Date?value:new Date(value);return new Date(date.getTime()+9*HOUR_MS).toISOString().slice(0,10)}
function repository(env={}){return clean(env.GITHUB_REPOSITORY,180)||'topmaster-joseph/ekodi-platform'}
function githubToken(env={}){return clean(env.GITHUB_TASK_TOKEN,2000)}
function db(env={}){return env?.DB?.prepare?env.DB:null}
function changes(result){return Number(result?.meta?.changes??result?.changes??0)}
function parseJson(value,fallback={}){try{return JSON.parse(value||JSON.stringify(fallback))}catch{return fallback}}
function json(value){try{return JSON.stringify(value??{})}catch{return '{}'}}

export const SITE_IMPROVEMENT_POLICY = Object.freeze({
  version:'1.0.0',
  cadence:'hourly-quiet-gate',
  dailyLimit:1,
  defaultQuietWindowMinutes:30,
  defaultMaxRecentSessions:2,
  defaultMaxRecentVisits:8,
  telemetryFreshnessHours:24,
  maxFiles:25,
  maxChangedLines:1600,
  sourceOfSites:'config/site-lifecycle-registry.json',
  canonicalHost:'ekodi.kr',
  directProductionMutation:false,
  protectedBoundaries:Object.freeze(['identity','auth','oauth','payment','billing','finance','credentials','security','dns','governance','migrations','deployment-config']),
});

export function eligibleSiteImprovementTargets(registry=siteLifecycleRegistry){
  const sites=Array.isArray(registry?.existingWorkspaceSites)?registry.existingWorkspaceSites:[];
  return Object.freeze(sites.filter(site=>{
    const url=clean(site?.canonicalUrl,500);
    if(!url.startsWith('https://ekodi.kr/'))return false;
    if(site?.class!=='workspace_user_site')return false;
    return !/preparing|planned|pending_canonical/i.test(clean(site?.migrationState,120));
  }).map(site=>Object.freeze({
    id:clean(site.id,120),
    name:clean(site.name,180)||clean(site.id,120),
    canonicalUrl:clean(site.canonicalUrl,500),
    runtime:clean(site.runtime,180),
    ownerKind:clean(site.ownerKind,80),
  })));
}

export function buildSiteImprovementPrompt(claim={}){
  const site=claim.site||{};
  return [
    'EKODI low-traffic daily site improvement task.',
    'Target site: '+(site.name||site.id)+' ('+site.id+')',
    'Canonical production URL: '+site.canonicalUrl,
    'Repository: topmaster-joseph/ekodi-platform. Work only in the allocated isolated branch/worktree.',
    'Deeply inspect the target site and every discoverable same-site subservice before editing. Use production HTTP/browser evidence plus repository evidence; do not guess.',
    'Check internal and external links, user/admin paths, login-before/login-after continuity, mobile and desktop responsive layout, header/footer/menu structure, shared-shell consistency, readability, intuitiveness, usability, accessibility, keyboard/tap targets, clipping, overlap, horizontal overflow, excessive whitespace, loading/error/empty states, and obvious broken functionality.',
    'Apply only bounded low-risk reversible fixes within the existing site/UI/service boundary. Prefer shared EKODI UI rules when the defect is genuinely shared, but avoid unrelated refactors.',
    'Canonical public routes must remain on https://ekodi.kr paths. Do not create or restore feature subdomains.',
    'Do not change identity, authentication, OAuth, permissions, payment, billing, finance, credentials, secrets, security boundaries, DNS, governance/constitution, migrations, deployment configuration, or production data. If such a change appears necessary, stop that part and report it for human review.',
    'Run the narrowest relevant tests plus regression checks for any shared component changed. Do not deploy production directly and do not push manually; the EKODI node commits and pushes the isolated branch after your work.',
    'Keep the diff minimal. If no safe defect is verified, make no source change and report no-change.',
    'At the end, only if source analysis is complete and relevant tests really passed, emit exactly one single-line marker:',
    'EKODI_SITE_IMPROVEMENT_EVIDENCE: {"analysis":true,"tests":true,"scopeSafe":true,"rollback":true}',
    'Do not emit that marker when any field is unverified.',
  ].join('\n');
}

export function parseSiteImprovementEvidence(output=''){
  const match=String(output||'').match(/EKODI_SITE_IMPROVEMENT_EVIDENCE:\s*(\{[^\r\n]+\})/i);
  if(!match)return Object.freeze({verified:false,reason:'evidence_marker_missing'});
  try{
    const evidence=JSON.parse(match[1]);
    const verified=evidence.analysis===true&&evidence.tests===true&&evidence.scopeSafe===true&&evidence.rollback===true;
    return Object.freeze({verified,evidence,reason:verified?'verified':'evidence_incomplete'});
  }catch{return Object.freeze({verified:false,reason:'evidence_invalid_json'})}
}

export function reviewChangedFiles(files=[]){
  const normalized=(Array.isArray(files)?files:[]).map(file=>({
    filename:clean(file?.filename,500),
    additions:Number(file?.additions||0),
    deletions:Number(file?.deletions||0),
    status:clean(file?.status,40),
  }));
  const protectedFiles=normalized.filter(file=>PROTECTED_FILE.test(file.filename)).map(file=>file.filename);
  const lines=normalized.reduce((sum,file)=>sum+file.additions+file.deletions,0);
  const reasons=[];
  if(protectedFiles.length)reasons.push('protected_boundary_changed');
  if(normalized.length>SITE_IMPROVEMENT_POLICY.maxFiles)reasons.push('diff_file_limit_exceeded');
  if(lines>SITE_IMPROVEMENT_POLICY.maxChangedLines)reasons.push('diff_line_limit_exceeded');
  return Object.freeze({
    safe:reasons.length===0,
    fileCount:normalized.length,
    changedLines:lines,
    protectedFiles:Object.freeze(protectedFiles),
    reasons:Object.freeze(reasons),
  });
}

async function github(env,path,options={}){
  const token=githubToken(env);
  if(!token)throw new Error('site_improvement_github_token_unavailable');
  const response=await fetch('https://api.github.com/repos/'+repository(env)+path,{
    method:options.method||'GET',
    headers:{
      authorization:'Bearer '+token,
      accept:'application/vnd.github+json',
      'content-type':'application/json',
      'x-github-api-version':'2022-11-28',
      'user-agent':'EKODI-Site-Improvement',
    },
    body:options.body===undefined?undefined:JSON.stringify(options.body),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error('github_'+response.status+':'+clean(data?.message||response.statusText,300));
    error.status=response.status;error.data=data;throw error;
  }
  return data;
}

async function setRun(env,day,fields={}){
  const store=db(env);if(!store)return;
  const entries=Object.entries({...fields,updated_at:new Date().toISOString()});
  if(!entries.length)return;
  const assignment=entries.map(entry=>entry[0]+'=?').join(',');
  await store.prepare('UPDATE ekodi_site_improvement_runs SET '+assignment+' WHERE run_day=?')
    .bind(...entries.map(([,value])=>typeof value==='object'?json(value):value),day).run();
}

async function advanceCursor(env,row,state='completed'){
  const store=db(env);if(!store)return;
  const sites=eligibleSiteImprovementTargets();
  const next=sites.length?(Number(row.site_index||0)+1)%sites.length:0;
  const now=new Date().toISOString();
  const statements=[
    store.prepare('UPDATE ekodi_site_improvement_runs SET state=?,deployment_state=?,completed_at=?,updated_at=? WHERE run_day=?')
      .bind(state,state,now,now,row.run_day),
    store.prepare("UPDATE ekodi_site_improvement_state SET cursor_index=?,last_site_id=?,last_task_id=?,last_completed_at=?,updated_at=? WHERE id='singleton'")
      .bind(next,row.site_id,row.task_id||'',now,now),
  ];
  if(row.task_id)statements.push(
    store.prepare("UPDATE ai_control_tasks SET state='completed',approval_state='system_verified',updated_at=? WHERE id=? AND created_by='ekodi-site-improvement-scheduler'")
      .bind(now,row.task_id)
  );
  await store.batch(statements);
}

async function trafficSnapshot(env,at=new Date()){
  const store=db(env);if(!store)return null;
  const quietWindow=integer(env.EKODI_SITE_IMPROVEMENT_QUIET_WINDOW_MINUTES,SITE_IMPROVEMENT_POLICY.defaultQuietWindowMinutes,15,180);
  const maxSessions=integer(env.EKODI_SITE_IMPROVEMENT_MAX_RECENT_SESSIONS,SITE_IMPROVEMENT_POLICY.defaultMaxRecentSessions,0,100);
  const maxVisits=integer(env.EKODI_SITE_IMPROVEMENT_MAX_RECENT_VISITS,SITE_IMPROVEMENT_POLICY.defaultMaxRecentVisits,0,1000);
  const cutoff=new Date(at.getTime()-quietWindow*60*1000).toISOString();
  const freshCutoff=new Date(at.getTime()-SITE_IMPROVEMENT_POLICY.telemetryFreshnessHours*HOUR_MS).toISOString();
  try{
    const row=await store.prepare("SELECT COUNT(DISTINCT CASE WHEN COALESCE(NULLIF(last_seen_at,''),first_seen_at) >= ? THEN host || ':' || session_hash END) AS recent_sessions, COALESCE(SUM(CASE WHEN COALESCE(NULLIF(last_seen_at,''),first_seen_at) >= ? THEN visit_count ELSE 0 END),0) AS recent_visits, MAX(COALESCE(NULLIF(last_seen_at,''),first_seen_at)) AS latest_activity FROM traffic_human_sessions WHERE COALESCE(NULLIF(last_seen_at,''),first_seen_at) >= ?")
      .bind(cutoff,cutoff,freshCutoff).first();
    const recentSessions=Number(row?.recent_sessions||0);
    const recentVisits=Number(row?.recent_visits||0);
    const latestActivity=clean(row?.latest_activity,80);
    return Object.freeze({
      quiet:!!latestActivity&&recentSessions<=maxSessions&&recentVisits<=maxVisits,
      recentSessions,recentVisits,latestActivity,
      quietWindowMinutes:quietWindow,maxSessions,maxVisits,cutoff,
      reason:!latestActivity?'traffic_telemetry_stale_or_empty':recentSessions>maxSessions?'recent_sessions_above_threshold':recentVisits>maxVisits?'recent_visits_above_threshold':'quiet',
    });
  }catch(error){
    return Object.freeze({quiet:false,reason:'traffic_telemetry_schema_unavailable',error:clean(error?.message||error,240)});
  }
}

export async function claimLowTrafficSiteImprovement(env={},options={}){
  const store=db(env);if(!store)return Object.freeze({claimed:false,reason:'state_store_unavailable'});
  if(String(env.EKODI_SITE_IMPROVEMENT_ENABLED||'true').toLowerCase()==='false')return Object.freeze({claimed:false,reason:'disabled'});
  const at=options.now instanceof Date?options.now:new Date(options.now||Date.now());
  const day=kstDay(at);
  const now=at.toISOString();
  const sites=eligibleSiteImprovementTargets();
  if(!sites.length)return Object.freeze({claimed:false,reason:'no_eligible_sites'});
  try{
    const unresolved=await store.prepare("SELECT * FROM ekodi_site_improvement_runs WHERE run_day<>? AND state IN ('claimed','queued','running','pr_open','deployment_verifying') ORDER BY run_day ASC LIMIT 1").bind(day).first();
    if(unresolved)return Object.freeze({claimed:false,reason:'previous_site_still_active',run:unresolved});

    const existing=await store.prepare('SELECT * FROM ekodi_site_improvement_runs WHERE run_day=?').bind(day).first();
    if(existing){
      const canRetry=existing.state==='failed'&&!existing.task_id&&Number(existing.attempts||0)<2;
      if(!canRetry)return Object.freeze({claimed:false,reason:'daily_site_already_claimed',run:existing});
      await store.prepare("UPDATE ekodi_site_improvement_runs SET state='claimed',attempts=attempts+1,error='',evaluated_at=?,updated_at=? WHERE run_day=? AND state='failed'")
        .bind(now,now,day).run();
      const site=sites.find(item=>item.id===existing.site_id)||sites[Number(existing.site_index||0)%sites.length];
      return Object.freeze({claimed:true,day,site,siteIndex:Number(existing.site_index||0),traffic:{recentSessions:Number(existing.recent_sessions||0),recentVisits:Number(existing.recent_visits||0),quietWindowMinutes:Number(existing.quiet_window_minutes||30)},retry:true});
    }

    const traffic=await trafficSnapshot(env,at);
    await store.prepare("UPDATE ekodi_site_improvement_state SET last_evaluated_at=?,updated_at=? WHERE id='singleton'").bind(now,now).run().catch(()=>null);
    if(!traffic?.quiet)return Object.freeze({claimed:false,reason:traffic?.reason||'traffic_not_quiet',traffic});

    const busy=await store.prepare("SELECT COUNT(*) AS n FROM ai_control_jobs WHERE state IN ('queued','leased','running')").first().catch(()=>({n:0}));
    const maxActive=integer(env.EKODI_SITE_IMPROVEMENT_MAX_ACTIVE_AI_JOBS,2,0,20);
    if(Number(busy?.n||0)>maxActive)return Object.freeze({claimed:false,reason:'ai_execution_queue_busy',activeJobs:Number(busy?.n||0),maxActive});

    const state=await store.prepare("SELECT cursor_index FROM ekodi_site_improvement_state WHERE id='singleton'").first();
    const siteIndex=((Number(state?.cursor_index)||0)%sites.length+sites.length)%sites.length;
    const site=sites[siteIndex];
    const result=await store.prepare("INSERT OR IGNORE INTO ekodi_site_improvement_runs (run_day,site_id,site_name,canonical_url,site_index,state,attempts,recent_sessions,recent_visits,quiet_window_minutes,quiet_threshold,evaluated_at,updated_at) VALUES (?,?,?,?,?,'claimed',1,?,?,?,?,?,?)")
      .bind(day,site.id,site.name,site.canonicalUrl,siteIndex,traffic.recentSessions,traffic.recentVisits,traffic.quietWindowMinutes,traffic.maxSessions,now,now).run();
    if(changes(result)<1)return Object.freeze({claimed:false,reason:'claim_raced'});
    return Object.freeze({claimed:true,day,site,siteIndex,traffic});
  }catch(error){
    return Object.freeze({claimed:false,reason:'site_improvement_schema_unavailable',error:clean(error?.message||error,300)});
  }
}

export async function attachSiteImprovementTask(env,claim,task={}){
  if(!claim?.claimed)return;
  const store=db(env);if(!store)return;
  const now=new Date().toISOString();
  await store.batch([
    store.prepare("UPDATE ekodi_site_improvement_runs SET state='queued',task_id=?,branch=?,started_at=?,updated_at=? WHERE run_day=?")
      .bind(clean(task.id,180),clean(task.branch,300),now,now,claim.day),
    store.prepare("UPDATE ekodi_site_improvement_state SET last_site_id=?,last_task_id=?,updated_at=? WHERE id='singleton'")
      .bind(claim.site.id,clean(task.id,180),now),
  ]);
}

export async function failSiteImprovementClaim(env,claim,error){
  if(!claim?.day)return;
  await setRun(env,claim.day,{state:'failed',error:clean(error?.message||error||'site_improvement_task_failed',500)});
}

export async function markSiteImprovementRunning(env,taskId){
  const store=db(env);if(!store)return;
  await store.prepare("UPDATE ekodi_site_improvement_runs SET state='running',updated_at=? WHERE task_id=? AND state='queued'")
    .bind(new Date().toISOString(),clean(taskId,180)).run();
}

export async function failSiteImprovementTask(env,taskId,error){
  const store=db(env);if(!store)return;
  await store.prepare("UPDATE ekodi_site_improvement_runs SET state='failed',error=?,updated_at=? WHERE task_id=?")
    .bind(clean(error?.message||error||'site_improvement_node_failed',500),new Date().toISOString(),clean(taskId,180)).run();
}

export async function completeSiteImprovementNodeJob(env,task,output=''){
  const store=db(env);if(!store)return Object.freeze({handled:false,reason:'state_store_unavailable'});
  const run=await store.prepare('SELECT * FROM ekodi_site_improvement_runs WHERE task_id=? ORDER BY run_day DESC LIMIT 1').bind(task.id).first();
  if(!run)return Object.freeze({handled:false,reason:'not_site_improvement_task'});
  const evidence=parseSiteImprovementEvidence(output);
  if(!evidence.verified){
    await setRun(env,run.run_day,{state:'blocked',evidence_json:evidence,error:evidence.reason});
    return Object.freeze({handled:true,state:'blocked',reason:evidence.reason});
  }
  try{
    const compare=await github(env,'/compare/'+encodeURIComponent('main...'+task.branch));
    const ahead=Number(compare?.ahead_by||0);
    const scope=reviewChangedFiles(compare?.files||[]);
    if(ahead===0){
      await setRun(env,run.run_day,{evidence_json:{...evidence,scope,noChange:true}});
      await advanceCursor(env,run,'no_change');
      return Object.freeze({handled:true,state:'no_change',scope});
    }
    if(!scope.safe){
      await setRun(env,run.run_day,{state:'blocked',evidence_json:{...evidence,scope},error:scope.reasons.join(',')});
      return Object.freeze({handled:true,state:'blocked',reason:'scope_guard_failed',scope});
    }

    let pr;
    try{
      pr=await github(env,'/pulls',{method:'POST',body:{
        title:'chore(site): daily low-traffic improvement for '+run.site_name,
        head:task.branch,
        base:'main',
        body:[
          'Automated EKODI low-traffic site improvement.',
          '',
          '- Site: **'+run.site_name+'** ('+run.site_id+')',
          '- Canonical URL: '+run.canonical_url,
          '- Quiet traffic: '+run.recent_sessions+' active session(s), '+run.recent_visits+' visit beacon(s) / '+run.quiet_window_minutes+' min',
          '- Scope: low-risk reversible UI/link/usability fixes only',
          '- Production mutation: none from the worker; merge and deployment remain gated by repository CI/release controls.',
          '',
          'EKODI scheduler will merge only after required checks report success and the deterministic protected-file/diff guard remains satisfied.',
        ].join('\n'),
      }});
    }catch(error){
      if(error.status!==422)throw error;
      const owner=repository(env).split('/')[0];
      const open=await github(env,'/pulls?state=open&head='+encodeURIComponent(owner+':'+task.branch)+'&base=main&per_page=10');
      pr=Array.isArray(open)?open[0]:null;
      if(!pr)throw error;
    }
    await setRun(env,run.run_day,{
      state:'pr_open',
      branch:task.branch,
      pull_request_number:Number(pr.number||0)||null,
      head_sha:clean(pr?.head?.sha||compare?.head_commit?.sha,120),
      evidence_json:{...evidence,scope},
      error:'',
    });
    return Object.freeze({handled:true,state:'pr_open',pullRequestNumber:Number(pr.number||0),scope});
  }catch(error){
    await setRun(env,run.run_day,{state:'blocked',error:clean(error?.message||error,500),evidence_json:evidence});
    return Object.freeze({handled:true,state:'blocked',reason:'pull_request_creation_failed',error:clean(error?.message||error,300)});
  }
}

async function checksReady(env,sha){
  const checks=await github(env,'/commits/'+encodeURIComponent(sha)+'/check-runs?per_page=100');
  const rows=Array.isArray(checks?.check_runs)?checks.check_runs:[];
  if(!rows.length)return Object.freeze({ready:false,reason:'checks_not_started',checks:0});
  const pending=rows.filter(row=>row.status!=='completed');
  const failed=rows.filter(row=>row.status==='completed'&&!SAFE_CONCLUSIONS.has(clean(row.conclusion,40).toLowerCase()));
  return Object.freeze({ready:pending.length===0&&failed.length===0,reason:failed.length?'checks_failed':pending.length?'checks_pending':'checks_passed',checks:rows.length,pending:pending.length,failed:failed.map(row=>clean(row.name,180))});
}

async function deploymentRunsReady(env,sha){
  const result=await github(env,'/actions/runs?head_sha='+encodeURIComponent(sha)+'&event=push&per_page=100');
  const rows=Array.isArray(result?.workflow_runs)?result.workflow_runs:[];
  if(!rows.length)return Object.freeze({ready:false,reason:'deployment_runs_not_started',runs:0});
  const pending=rows.filter(row=>row.status!=='completed');
  const failed=rows.filter(row=>row.status==='completed'&&!SAFE_CONCLUSIONS.has(clean(row.conclusion,40).toLowerCase()));
  return Object.freeze({ready:pending.length===0&&failed.length===0,reason:failed.length?'deployment_run_failed':pending.length?'deployment_runs_pending':'deployment_runs_passed',runs:rows.length,pending:pending.length,failed:failed.map(row=>clean(row.name,180))});
}

function sameSiteLink(base,value){
  try{
    const url=new URL(value,base);
    const root=new URL(base);
    if(url.origin!==root.origin)return null;
    const prefix=root.pathname.replace(/\/$/,'');
    if(prefix&&url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
    if(/\/(?:logout|signout)(?:\/|$)/i.test(url.pathname))return null;
    url.hash='';url.search='';
    return url.toString();
  }catch{return null}
}

export async function verifySiteProductionLinks(canonicalUrl,options={}){
  const limit=Math.max(1,Math.min(20,Number(options.limit)||12));
  try{
    const response=await fetch(canonicalUrl,{method:'GET',redirect:'follow',headers:{accept:'text/html','user-agent':'EKODI-Site-Improvement-Verifier/1.0'}});
    if(!response.ok)return Object.freeze({ok:false,reason:'root_http_'+response.status,checked:0});
    const html=(await response.text()).slice(0,750000);
    const links=[];const seen=new Set([canonicalUrl]);
    for(const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)){
      const link=sameSiteLink(canonicalUrl,match[1]);if(!link||seen.has(link))continue;
      seen.add(link);links.push(link);if(links.length>=limit)break;
    }
    const failures=[];
    for(const url of links){
      try{
        const probe=await fetch(url,{method:'GET',redirect:'manual',headers:{accept:'text/html,*/*;q=0.8','user-agent':'EKODI-Site-Improvement-Verifier/1.0'}});
        if(probe.status<200||probe.status>=400)failures.push({url,status:probe.status});
      }catch(error){failures.push({url,error:clean(error?.message||error,180)})}
    }
    return Object.freeze({ok:failures.length===0,reason:failures.length?'subservice_link_failure':'verified',checked:links.length+1,failures:Object.freeze(failures)});
  }catch(error){
    return Object.freeze({ok:false,reason:'production_probe_failed',error:clean(error?.message||error,240),checked:0});
  }
}

export async function reconcileSiteImprovementRelease(env={}){
  const store=db(env);if(!store)return Object.freeze({handled:false,reason:'state_store_unavailable'});
  let row;
  try{
    row=await store.prepare("SELECT * FROM ekodi_site_improvement_runs WHERE state IN ('pr_open','deployment_verifying') ORDER BY run_day ASC LIMIT 1").first();
  }catch(error){
    return Object.freeze({handled:false,reason:'site_improvement_schema_unavailable',error:clean(error?.message||error,240)});
  }
  if(!row)return Object.freeze({handled:false,reason:'no_release_to_reconcile'});
  try{
    if(row.state==='pr_open'){
      const pr=await github(env,'/pulls/'+Number(row.pull_request_number));
      if(pr.merged_at){
        await setRun(env,row.run_day,{state:'deployment_verifying',merge_sha:clean(pr.merge_commit_sha,120),deployment_state:'waiting_for_main_release'});
        return Object.freeze({handled:true,state:'deployment_verifying',reason:'already_merged'});
      }
      if(pr.state!=='open'){
        await setRun(env,row.run_day,{state:'blocked',error:'pull_request_closed_without_merge'});
        return Object.freeze({handled:true,state:'blocked',reason:'pull_request_closed_without_merge'});
      }
      if(pr.mergeable===false){
        await setRun(env,row.run_day,{state:'blocked',error:'pull_request_not_mergeable'});
        return Object.freeze({handled:true,state:'blocked',reason:'pull_request_not_mergeable'});
      }
      const sha=clean(pr?.head?.sha||row.head_sha,120);
      const check=await checksReady(env,sha);
      if(!check.ready){
        if(check.reason==='checks_failed')await setRun(env,row.run_day,{state:'blocked',error:'checks_failed:'+check.failed.join(','),deployment_state:check.reason});
        else await setRun(env,row.run_day,{deployment_state:check.reason});
        return Object.freeze({handled:true,state:check.reason,check});
      }
      if(pr.mergeable!==true||!['clean','has_hooks'].includes(clean(pr.mergeable_state,40))){
        await setRun(env,row.run_day,{deployment_state:'merge_wait:'+(clean(pr.mergeable_state,40)||'unknown')});
        return Object.freeze({handled:true,state:'merge_wait',mergeableState:pr.mergeable_state});
      }
      const merged=await github(env,'/pulls/'+Number(row.pull_request_number)+'/merge',{method:'PUT',body:{merge_method:'squash',sha}});
      if(merged.merged!==true)throw new Error(clean(merged.message,300)||'github_merge_rejected');
      await setRun(env,row.run_day,{state:'deployment_verifying',merge_sha:clean(merged.sha,120),deployment_state:'waiting_for_main_release'});
      return Object.freeze({handled:true,state:'deployment_verifying',mergeSha:clean(merged.sha,120)});
    }

    const sha=clean(row.merge_sha,120);
    if(!sha)return Object.freeze({handled:true,state:'deployment_verifying',reason:'merge_sha_pending'});
    const release=await deploymentRunsReady(env,sha);
    if(!release.ready){
      if(release.reason==='deployment_run_failed')await setRun(env,row.run_day,{state:'blocked',error:'deployment_failed:'+release.failed.join(','),deployment_state:release.reason});
      else await setRun(env,row.run_day,{deployment_state:release.reason});
      return Object.freeze({handled:true,state:release.reason,release});
    }
    const production=await verifySiteProductionLinks(row.canonical_url);
    if(!production.ok){
      await setRun(env,row.run_day,{state:'blocked',deployment_state:'production_verification_failed',error:production.reason+':'+json(production.failures||[]),evidence_json:{...parseJson(row.evidence_json,{}),production}});
      return Object.freeze({handled:true,state:'blocked',reason:'production_verification_failed',production});
    }
    await setRun(env,row.run_day,{deployment_state:'production_verified',evidence_json:{...parseJson(row.evidence_json,{}),production}});
    await advanceCursor(env,row,'completed');
    return Object.freeze({handled:true,state:'completed',production});
  }catch(error){
    await setRun(env,row.run_day,{deployment_state:'reconcile_error',error:clean(error?.message||error,500)});
    return Object.freeze({handled:true,state:'reconcile_error',error:clean(error?.message||error,300)});
  }
}

export const __test = Object.freeze({kstDay,sameSiteLink,protectedFilePattern:PROTECTED_FILE});
