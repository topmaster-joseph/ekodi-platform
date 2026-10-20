#!/usr/bin/env node
// GitHub-side watcher for the SeonamMedi crawl. Reads health from ekodi-auth D1
// (Cloudflare D1 HTTP API) and opens / reminds / closes the Owner alert issue
// with this workflow's GITHUB_TOKEN. Works even when the Worker cannot reach
// GitHub (e.g. an expired dispatch token), because it runs from GitHub itself.
//   --runner-failed   the runner job just failed: alert even if data looks fresh
import fs from 'node:fs';
import {createD1HttpBinding,ekodiAuthDatabaseId} from './seonammedi-monitor-runner.mjs';
import {readCrawlHealth,syncCrawlAlertIssue} from '../seonammedi-crawl-health.js';

const cfToken=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const ghToken=String(process.env.GITHUB_TOKEN||'').trim();
const repository=String(process.env.GITHUB_REPOSITORY||'topmaster-joseph/ekodi-platform').trim();
const runUrl=process.env.GITHUB_RUN_ID?`https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`:'';
const runnerFailed=process.argv.includes('--runner-failed');

async function main(){
  if(!ghToken)throw new Error('GITHUB_TOKEN is required');
  let health;
  if(cfToken&&accountId){
    const databaseId=ekodiAuthDatabaseId(fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8'));
    health=await readCrawlHealth(createD1HttpBinding({accountId,databaseId,token:cfToken}));
  }else{
    health={healthy:false,stale:true,wakeFailing:false,lastOk:null,ageMinutes:null,reasons:['감시 작업이 에코디 데이터베이스에 접속할 수 없습니다(Cloudflare 자격 정보 없음).']};
  }
  if(runnerFailed&&health.healthy)health={...health,healthy:false,reasons:['GitHub 수집 실행이 실패했습니다. 다음 정각 수집에서 자동으로 다시 시도합니다.',...health.reasons]};
  const result=await syncCrawlAlertIssue({health,token:ghToken,repository,source:runnerFailed?'에코디 수집 작업(실패 감지)':'에코디 GitHub 감시',runUrl});
  const summary={healthy:health.healthy,lastOk:health.lastOk,ageMinutes:health.ageMinutes,reasons:health.reasons,...result};
  console.log(JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### SeonamMedi crawl watch\n```json\n'+JSON.stringify(summary,null,2)+'\n```\n');
}

if(import.meta.url===`file://${process.argv[1]}`)main().catch(error=>{console.error('[SEONAMMEDI-CRAWL-WATCH] '+(error?.message||error));process.exit(1)});
