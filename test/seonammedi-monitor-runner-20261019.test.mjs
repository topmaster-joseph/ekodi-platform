import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1HttpBinding,ekodiAuthDatabaseId} from '../scripts/seonammedi-monitor-runner.mjs';

// Production evidence (2026-10-19 05:00Z run): from Workers egress Google News
// returned 503 and Bing a non-RSS page; 0 of 413 items could be resolved.

test('runner targets the ekodi-auth D1 declared in wrangler.site.toml',async()=>{
  const toml=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(ekodiAuthDatabaseId(toml),/^[0-9a-f-]{36}$/);
  assert.equal(ekodiAuthDatabaseId('name = "x"'),'');
});

test('D1 HTTP binding maps prepare/bind/first/all/run onto the query API',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options,body:JSON.parse(options.body)});
    return Response.json({success:true,result:[{results:[{id:7,title:'x'}],meta:{last_row_id:7,changes:1}}]});
  };
  const db=createD1HttpBinding({accountId:'acc',databaseId:'db',token:'tok',fetchImpl});
  assert.deepEqual(await db.prepare('SELECT id FROM t WHERE a=?').bind('v',undefined).first(),{id:7,title:'x'});
  assert.equal((await db.prepare('SELECT 1').all()).results.length,1);
  assert.equal((await db.prepare('INSERT INTO t VALUES (?)').bind(1).run()).meta.last_row_id,7);
  assert.equal(calls[0].url,'https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db/query');
  assert.equal(calls[0].options.headers.authorization,'Bearer tok');
  assert.deepEqual(calls[0].body,{sql:'SELECT id FROM t WHERE a=?',params:['v',null]});
});

test('D1 HTTP errors surface the API message so monitor guards can react',async()=>{
  const db=createD1HttpBinding({accountId:'a',databaseId:'d',token:'t',fetchImpl:async()=>Response.json({success:false,errors:[{message:'no such column: verify_checked_at'}]},{status:400})});
  await assert.rejects(db.prepare('SELECT verify_checked_at FROM x').all(),/no such column: verify_checked_at/);
});

test('scheduled runner workflow is hourly, least-privilege and uses the shared monitor',async()=>{
  const [workflow,script]=await Promise.all([
    readFile(new URL('../.github/workflows/seonammedi-news-monitor-runner.yml',import.meta.url),'utf8'),
    readFile(new URL('../scripts/seonammedi-monitor-runner.mjs',import.meta.url),'utf8')
  ]);
  assert.match(workflow,/cron: '25 \* \* \* \*'/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/permissions:\n  contents: read/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/node scripts\/seonammedi-monitor-runner\.mjs/);
  assert.match(script,/import \{runSeonamMediHourlyCheck\} from '\.\.\/seonammedi-monitor\.js'/);
  assert.match(script,/force:true/);
});

test('runner skips when a successful monitor run happened in the last 40 minutes',async()=>{
  const {recentSuccessfulRun,RECENT_RUN_WINDOW_MS}=await import('../scripts/seonammedi-monitor-runner.mjs');
  assert.equal(RECENT_RUN_WINDOW_MS,40*60*1000);
  let seen=null;
  const db={prepare(sql){return {bind(since){seen={sql,since};return this},async first(){return {id:405,started_at:'2026-10-19T05:48:03Z'}}}}};
  assert.deepEqual(await recentSuccessfulRun(db,Date.parse('2026-10-19T06:00:00Z')),{id:405,started_at:'2026-10-19T05:48:03Z'});
  assert.match(seen.sql,/status='ok' AND started_at>=\?/);
  assert.equal(seen.since,'2026-10-19T05:20:00.000Z');
  const failing={prepare(){return {bind(){return this},first:async()=>{throw new Error('down')}}}};
  assert.equal(await recentSuccessfulRun(failing,Date.now()),null,'guard failure never blocks collection');
});

test('completed CI runs also wake the runner because schedules are throttled',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/seonammedi-news-monitor-runner.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_run:\n    workflows: \[CI\]\n    types: \[completed\]/);
  assert.doesNotMatch(workflow,/ref: \$\{\{ github\.event\.workflow_run/,'never checks out code from the triggering run');
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && '--force'/);
});
