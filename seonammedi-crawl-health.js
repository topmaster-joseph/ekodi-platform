// EKODI self-watch for the SeonamMedi news crawl (Owner request 2026-10-20):
// EKODI itself — not an external assistant — detects collection failures and
// notifies the Owner. Delivery is a GitHub issue in this repository that
// mentions the Owner, so GitHub sends e-mail / mobile notifications without
// any additional credential. Two independent watchers use this module:
//   1. the Control API Worker cron (hourly, reliable) and
//   2. the GitHub workflow seonammedi-crawl-alert.yml (backup schedule and
//      runner-failure hook), which also works when the Worker cannot reach GitHub.

export const CRAWL_HEALTH_POLICY=Object.freeze({
  // The 16:00 KST hour is skipped by the Worker (Coupang report pass), so allow
  // one missed hour plus slack before calling collection stale.
  staleAfterMinutes:150,
  minSourcesForFullRun:10,
  failedWakesBeforeAlert:2,
  renotifyAfterHours:6,
  alertLabel:'seonammedi-crawl-alert',
  owner:'topmaster-joseph',
  repository:'topmaster-joseph/ekodi-platform',
  alertWorkflow:'seonammedi-crawl-alert.yml'
});

const clean=(value,max=300)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const kst=iso=>{const ms=Date.parse(iso||'');if(!Number.isFinite(ms))return '기록 없음';return new Date(ms+9*3600000).toISOString().slice(0,16).replace('T',' ')+' (KST)'};

const WAKE_REASON_KO=Object.freeze({
  github_http_401:'GitHub 실행 키가 유효하지 않습니다(만료 또는 삭제). 키를 다시 발급해 SEONAMMEDI_DISPATCH_TOKEN에 저장해 주세요.',
  github_http_403:'GitHub 실행 키에 권한이 없습니다. 키의 Actions 권한(Read and write)과 저장소 선택을 확인해 주세요.',
  github_http_404:'GitHub 수집 작업을 찾지 못했습니다. 저장소 또는 작업 파일 이름을 확인해야 합니다.',
  dispatch_token_not_configured:'서버에 GitHub 실행 키가 설정되어 있지 않습니다.'
});

// Pure decision: given the latest full monitor runs and hourly wakes, is the
// crawl healthy? Returns a stable shape used by both watchers.
export function evaluateCrawlHealth({runs=[],wakes=[],now=Date.now(),policy=CRAWL_HEALTH_POLICY}={}){
  const full=(Array.isArray(runs)?runs:[]).filter(run=>run&&run.status==='ok'&&Number(run.sources_checked||0)>=policy.minSourcesForFullRun);
  const lastOk=full.map(run=>run.started_at).filter(Boolean).sort().at(-1)||null;
  const ageMinutes=lastOk?Math.round((now-Date.parse(lastOk))/60000):null;
  const recentWakes=(Array.isArray(wakes)?wakes:[]).slice().sort((a,b)=>String(b.woke_at).localeCompare(String(a.woke_at))).slice(0,policy.failedWakesBeforeAlert);
  const wakeFailing=recentWakes.length>=policy.failedWakesBeforeAlert&&recentWakes.every(wake=>Number(wake.ok)!==1);
  const stale=ageMinutes===null||ageMinutes>policy.staleAfterMinutes;
  const reasons=[];
  if(stale)reasons.push(lastOk?`마지막 정상 수집이 ${Math.floor(ageMinutes/60)}시간 ${ageMinutes%60}분 전(${kst(lastOk)})입니다.`:'정상 수집 기록이 없습니다.');
  if(wakeFailing){
    const detail=clean(recentWakes[0]?.detail,80);
    reasons.push('매시 정각 수집 깨우기가 연속 실패했습니다: '+(WAKE_REASON_KO[detail]||detail||'원인 미상'));
  }
  return Object.freeze({healthy:!stale&&!wakeFailing,stale,wakeFailing,lastOk,ageMinutes,lastWake:recentWakes[0]||null,reasons});
}

export function alertIssueBody(health,{source='EKODI',runUrl=''}={}){
  const lines=[
    `@${CRAWL_HEALTH_POLICY.owner} 서남권 국립의대 소통센터의 활동이력·관련소식 기사 자동수집에 이상이 감지되었습니다.`,
    '',
    ...health.reasons.map(reason=>'- '+reason),
    '',
    `- 마지막 정상 수집: ${kst(health.lastOk)}`,
    `- 감지 주체: ${source}`,
    runUrl?`- 실행 기록: ${runUrl}`:'',
    '',
    '정상 수집이 다시 확인되면 에코디가 이 이슈에 복구 사실을 남기고 자동으로 닫습니다.'
  ];
  return lines.filter((line,index)=>line!==''||lines[index-1]!=='').join('\n');
}

export function recoveryComment(health){
  return `@${CRAWL_HEALTH_POLICY.owner} 기사 자동수집이 정상으로 복구되었습니다. 마지막 정상 수집: ${kst(health.lastOk)}. 이 이슈를 자동으로 닫습니다.`;
}

// GitHub issue lifecycle shared by the workflow watcher (GITHUB_TOKEN with
// issues: write). Opens one labelled issue, re-notifies at most every 6h and
// closes it on recovery.
export async function syncCrawlAlertIssue({health,token,repository=CRAWL_HEALTH_POLICY.repository,source='EKODI',runUrl='',now=Date.now(),fetchImpl=fetch}){
  const api=async(path,options={})=>{
    const response=await fetchImpl('https://api.github.com/repos/'+repository+path,{...options,headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json','user-agent':'EKODI-SeonamMedi-Watch/1.0',...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('github_http_'+response.status);
    return data;
  };
  const label=CRAWL_HEALTH_POLICY.alertLabel;
  const open=await api(`/issues?state=open&labels=${encodeURIComponent(label)}&per_page=5`);
  const issue=Array.isArray(open)?open.find(item=>!item.pull_request):null;
  if(health.healthy){
    if(!issue)return {action:'none'};
    await api(`/issues/${issue.number}/comments`,{method:'POST',body:JSON.stringify({body:recoveryComment(health)})});
    await api(`/issues/${issue.number}`,{method:'PATCH',body:JSON.stringify({state:'closed',state_reason:'completed'})});
    return {action:'closed',issue:issue.number};
  }
  const body=alertIssueBody(health,{source,runUrl});
  if(!issue){
    const created=await api('/issues',{method:'POST',body:JSON.stringify({title:'[서남권 사이트] 기사 자동수집 이상 감지',body,labels:[label]})});
    return {action:'opened',issue:created.number};
  }
  const last=Date.parse(issue.updated_at||issue.created_at||'');
  if(Number.isFinite(last)&&now-last<CRAWL_HEALTH_POLICY.renotifyAfterHours*3600000)return {action:'recently_notified',issue:issue.number};
  await api(`/issues/${issue.number}/comments`,{method:'POST',body:JSON.stringify({body:'아직 해결되지 않았습니다.\n\n'+body})});
  return {action:'renotified',issue:issue.number};
}

async function readHealthInputs(db,now){
  const since=new Date(now-24*3600000).toISOString();
  const runs=(await db.prepare("SELECT started_at,status,sources_checked FROM seonammedi_monitor_runs WHERE started_at>=? ORDER BY id DESC LIMIT 200").bind(since).all())?.results||[];
  let wakes=[];
  try{wakes=(await db.prepare('SELECT woke_at,ok,detail FROM seonammedi_runner_wakes ORDER BY id DESC LIMIT 5').all())?.results||[]}catch{}
  return {runs,wakes};
}
export async function readCrawlHealth(db,{now=Date.now()}={}){
  return evaluateCrawlHealth({...(await readHealthInputs(db,now)),now});
}

// Worker-side watcher: decide from D1 and ask the alert workflow to notify.
// Transition-based (ok -> alert, alert -> ok) plus a 6h reminder, persisted in
// seonammedi_crawl_alert_state so an hourly cron never spams the Owner.
export async function watchSeonamMediCrawl(env,{now=Date.now(),fetchImpl=fetch}={}){
  if(!env?.DB?.prepare)return {ok:false,error:'storage_unavailable'};
  const health=await readCrawlHealth(env.DB,{now});
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS seonammedi_crawl_alert_state (id INTEGER PRIMARY KEY CHECK (id=1), state TEXT NOT NULL, since TEXT NOT NULL, notified_at TEXT, reason TEXT NOT NULL DEFAULT '')").run();
  const previous=await env.DB.prepare('SELECT state,since,notified_at FROM seonammedi_crawl_alert_state WHERE id=1').first();
  const state=health.healthy?'ok':'alert';
  const stamp=new Date(now).toISOString();
  const lastNotified=Date.parse(previous?.notified_at||'');
  const due=state==='alert'
    ?(previous?.state!=='alert'||!Number.isFinite(lastNotified)||now-lastNotified>=CRAWL_HEALTH_POLICY.renotifyAfterHours*3600000)
    :previous?.state==='alert';
  let notify={skipped:'not_due'};
  if(due)notify=await dispatchAlertWorkflow(env,{state,reason:health.reasons.join(' / ')},{fetchImpl});
  const notifiedAt=due&&notify.ok?stamp:(previous?.notified_at||null);
  await env.DB.prepare('INSERT INTO seonammedi_crawl_alert_state(id,state,since,notified_at,reason) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,since=CASE WHEN seonammedi_crawl_alert_state.state=excluded.state THEN seonammedi_crawl_alert_state.since ELSE excluded.since END,notified_at=excluded.notified_at,reason=excluded.reason')
    .bind(state,stamp,notifiedAt,clean(health.reasons.join(' / '),500)).run();
  return {ok:true,state,healthy:health.healthy,notified:Boolean(due&&notify.ok),notify};
}

export async function dispatchAlertWorkflow(env,{state,reason},{fetchImpl=fetch}={}){
  const token=String(env?.SEONAMMEDI_DISPATCH_TOKEN||'').trim();
  if(!token)return {ok:false,skipped:'dispatch_token_not_configured'};
  try{
    const response=await fetchImpl(`https://api.github.com/repos/${CRAWL_HEALTH_POLICY.repository}/actions/workflows/${CRAWL_HEALTH_POLICY.alertWorkflow}/dispatches`,{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json','user-agent':'EKODI-SeonamMedi-Watch/1.0'},
      body:JSON.stringify({ref:'main',inputs:{source:'ekodi-worker',expected_state:state,reason:clean(reason,240)}}),
      signal:AbortSignal.timeout(7000)
    });
    return response.status===204?{ok:true}:{ok:false,error:'github_http_'+response.status};
  }catch(error){return {ok:false,error:'github_dispatch_failed'}}
}
