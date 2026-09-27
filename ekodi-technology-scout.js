const CATEGORIES=Object.freeze(['ai','openai','agents-mcp','cloudflare','supabase-postgresql','github-devops','security','web-ui','automation','commerce-marketing']);
const text=(v,n=2000)=>String(v??'').trim().slice(0,n);
const id=(prefix='ts')=>prefix+'_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36));
async function insertRun(db,runId,trigger){await db.prepare('INSERT INTO ekodi_technology_scout_runs(run_id,trigger_source) VALUES(?,?)').bind(runId,trigger).run();}
async function finishRun(db,runId,status,count,summary,error=''){await db.prepare('UPDATE ekodi_technology_scout_runs SET completed_at=CURRENT_TIMESTAMP,status=?,candidate_count=?,summary=?,error_summary=? WHERE run_id=?').bind(status,count,text(summary),text(error),runId).run();}
function normalizeCandidate(v={}){return {category:CATEGORIES.includes(v.category)?v.category:'automation',title:text(v.title,240),sourceUrl:text(v.sourceUrl,1200),publisher:text(v.publisher,240),publishedAt:text(v.publishedAt,80),finding:text(v.finding),target:text(v.ekodiTarget,500),benefit:text(v.expectedBenefit,1000),difficulty:['low','medium','high'].includes(v.implementationDifficulty)?v.implementationDifficulty:'medium',cost:text(v.costImpact,800),security:text(v.securityRisk,800),lockin:text(v.vendorLockinRisk,800),operations:text(v.operationsRisk,800),recommendation:['apply','review','hold','reject'].includes(v.recommendation)?v.recommendation:'review'};}
async function saveCandidate(db,runId,raw){const v=normalizeCandidate(raw);if(!v.title||!v.finding||!v.target)return false;await db.prepare(`INSERT INTO ekodi_technology_scout_candidates(candidate_id,run_id,category,title,source_url,source_publisher,published_at,finding,ekodi_target,expected_benefit,implementation_difficulty,cost_impact,security_risk,vendor_lockin_risk,operations_risk,recommendation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id('candidate'),runId,v.category,v.title,v.sourceUrl,v.publisher,v.publishedAt,v.finding,v.target,v.benefit,v.difficulty,v.cost,v.security,v.lockin,v.operations,v.recommendation).run();return true;}
export async function runEkodiDailyTechnologyScout(env,{trigger='ekodi-cron'}={}){
 if(!env?.DB?.prepare)return {ok:false,status:'db_required'};
 const runId=id('scout');await insertRun(env.DB,runId,trigger);
 try{
   // EKODI-owned adapter boundary. TECH_SCOUT_SOURCE may be a search/RSS/provider worker binding.
   // Provider output is evidence only and can never authorize execution or deployment.
   const source=env.TECH_SCOUT_SOURCE;
   if(!source?.fetch){await finishRun(env.DB,runId,'degraded',0,'기술 스카우트 수집원 연결 대기','TECH_SCOUT_SOURCE binding unavailable');return {ok:false,runId,status:'source_unavailable'};}
   const req=new Request('https://ekodi.internal/daily-tech-scout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner:'EKODI',categories:CATEGORIES,mode:'discover-only',executionAuthority:false})});
   const res=await source.fetch(req);if(!res.ok)throw new Error('source_http_'+res.status);
   const payload=await res.json();const rows=Array.isArray(payload?.candidates)?payload.candidates:[];
   let saved=0;for(const row of rows.slice(0,50))if(await saveCandidate(env.DB,runId,row))saved++;
   await finishRun(env.DB,runId,'completed',saved,`EKODI 일일 기술 스카우트 후보 ${saved}건 생성`);
   return {ok:true,runId,status:'completed',candidateCount:saved};
 }catch(error){await finishRun(env.DB,runId,'failed',0,'기술 스카우트 실패',error?.message||error);return {ok:false,runId,status:'failed',error:text(error?.message||error,300)};}
}
export async function getTechnologyScoutOverview(env){const runs=await env.DB.prepare('SELECT * FROM ekodi_technology_scout_runs ORDER BY started_at DESC LIMIT 10').all();const candidates=await env.DB.prepare("SELECT * FROM ekodi_technology_scout_candidates ORDER BY CASE decision WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 100").all();return {ok:true,owner:'EKODI',runs:runs.results||[],candidates:candidates.results||[]};}
export async function decideTechnologyScoutCandidate(env,{candidateId,decision,actor}){if(!['apply','hold','reject'].includes(decision))throw new Error('invalid_decision');const result=await env.DB.prepare("UPDATE ekodi_technology_scout_candidates SET decision=?,decision_by=?,decided_at=CURRENT_TIMESTAMP WHERE candidate_id=? AND decision='pending'").bind(decision,text(actor,160)||'ekodi-admin',text(candidateId,160)).run();return {ok:true,changed:Number(result.meta?.changes||0),candidateId,decision};}
export const EKODI_TECH_SCOUT_POLICY=Object.freeze({owner:'EKODI',schedule:'daily',externalProviders:'sources-only',automaticProductionMutation:false,humanDecisionRequired:true,categories:CATEGORIES});
