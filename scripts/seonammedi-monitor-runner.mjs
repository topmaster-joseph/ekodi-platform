#!/usr/bin/env node
// SeonamMedi news monitor executed from a GitHub-hosted runner.
//
// Production evidence (2026-10-19): from Cloudflare Workers egress, Google News
// returns HTTP 503 and Bing returns a non-RSS page, so the hourly Worker cron
// could neither collect nor resolve publisher URLs (0 of 413 items verified).
// The identical monitor logic runs here against the same ekodi-auth D1 through
// the Cloudflare D1 HTTP API. Publication policy is unchanged: only items whose
// original publisher page is verified become public.
import fs from 'node:fs';
import {runSeonamMediHourlyCheck} from '../seonammedi-monitor.js';

const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const dryRun=process.argv.includes('--dry-run');

export function ekodiAuthDatabaseId(wranglerToml){
  return String(wranglerToml||'').match(/database_name\s*=\s*"ekodi-auth"[\s\S]{0,240}?database_id\s*=\s*"([^"]+)"/)?.[1]||'';
}

// Minimal D1 binding (prepare/bind/first/all/run) backed by the D1 HTTP API.
export function createD1HttpBinding({accountId,databaseId,token,fetchImpl=fetch}){
  async function query(sql,params){
    const response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({sql,params:params.map(value=>value===undefined?null:value)})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.success!==true){
      const message=(data?.errors||[]).map(error=>error?.message).filter(Boolean).join('; ')||('HTTP '+response.status);
      throw new Error(message);
    }
    const result=Array.isArray(data.result)?data.result[0]:data.result;
    return {results:result?.results||[],meta:result?.meta||{}};
  }
  return {prepare(sql){
    let params=[];
    const statement={
      bind(...values){params=values;return statement},
      async all(){const r=await query(sql,params);return {results:r.results,meta:r.meta,success:true}},
      async first(){const r=await query(sql,params);return r.results[0]??null},
      async run(){const r=await query(sql,params);return {success:true,meta:r.meta}}
    };
    return statement;
  }};
}

export const RECENT_RUN_WINDOW_MS=40*60*1000;
export async function recentSuccessfulRun(db,nowMs,windowMs=RECENT_RUN_WINDOW_MS){
  const since=new Date(nowMs-windowMs).toISOString();
  const row=await db.prepare("SELECT id,started_at FROM seonammedi_monitor_runs WHERE status='ok' AND started_at>=? ORDER BY id DESC LIMIT 1").bind(since).first().catch(()=>null);
  return row||null;
}
async function main(){
  if(!token||!accountId)throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  const databaseId=ekodiAuthDatabaseId(fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8'));
  if(!databaseId)throw new Error('ekodi-auth D1 database id not found');
  if(dryRun){console.log(JSON.stringify({ok:true,dryRun:true,databaseId}));return}
  const db=createD1HttpBinding({accountId,databaseId,token});
  if(!process.argv.includes('--force')){
    const recent=await recentSuccessfulRun(db,Date.now());
    if(recent){console.log(JSON.stringify({skipped:true,reason:'recent_successful_run',runId:recent.id,startedAt:recent.started_at}));return}
  }
  const naver=process.env.NAVER_CLIENT_ID&&process.env.NAVER_CLIENT_SECRET?{NAVER_CLIENT_ID:process.env.NAVER_CLIENT_ID,NAVER_CLIENT_SECRET:process.env.NAVER_CLIENT_SECRET}:{};
  const env={DB:db,...naver};
  console.log(JSON.stringify({naverSearch:Boolean(naver.NAVER_CLIENT_ID)}));
  // Runner egress has no Workers subrequest cap: verify more per run so Naver/Google
  // candidates reach the publisher-verification gate within the same hour.
  const result=await runSeonamMediHourlyCheck(env,{scheduledAt:new Date().toISOString(),force:true,verifyBudget:60,reverifyLimit:40});
  const summary={status:result.status,checked:result.checked,seen:result.seen,added:result.added,verified:result.verified,reverified:result.reverified,errors:(result.errors||[]).slice(0,8)};
  console.log(JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### SeonamMedi runner monitor\n```json\n'+JSON.stringify(summary,null,2)+'\n```\n');
  if(result.ok===false)process.exitCode=1;
}

if(import.meta.url===`file://${process.argv[1]}`)main().catch(error=>{console.error('[SEONAMMEDI-RUNNER-MONITOR] '+(error?.message||error));process.exit(1)});
