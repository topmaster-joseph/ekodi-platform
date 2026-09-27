import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  SITE_IMPROVEMENT_POLICY,
  eligibleSiteImprovementTargets,
  buildSiteImprovementPrompt,
  parseSiteImprovementEvidence,
  reviewChangedFiles,
} from '../ekodi-site-improvement-scheduler.js';

test('site improvement targets only canonical apex workspace sites',()=>{
  const targets=eligibleSiteImprovementTargets();
  assert.ok(targets.length>=8);
  assert.ok(targets.every(site=>site.canonicalUrl.startsWith('https://ekodi.kr/')));
  assert.equal(targets.some(site=>site.id==='ekodi-trade'),false);
  assert.equal(targets.some(site=>site.id==='ekodi-cafe'),false);
  assert.equal(targets[0].id,'jadam');
});

test('site improvement prompt requires deep subservice UX review and protected boundaries',()=>{
  const site=eligibleSiteImprovementTargets()[0];
  const prompt=buildSiteImprovementPrompt({site});
  for(const term of ['internal and external links','login-before/login-after','mobile and desktop','readability','accessibility','clipping','excessive whitespace','loading/error/empty states','https://ekodi.kr paths','Do not change identity','Do not deploy production directly']){
    assert.ok(prompt.toLowerCase().includes(term.toLowerCase()),term);
  }
  assert.match(prompt,/EKODI_SITE_IMPROVEMENT_EVIDENCE/);
});

test('evidence marker fails closed',()=>{
  assert.equal(parseSiteImprovementEvidence('done').verified,false);
  assert.equal(parseSiteImprovementEvidence('EKODI_SITE_IMPROVEMENT_EVIDENCE: {"analysis":true,"tests":true,"scopeSafe":true,"rollback":true}').verified,true);
  assert.equal(parseSiteImprovementEvidence('EKODI_SITE_IMPROVEMENT_EVIDENCE: {"analysis":true,"tests":false,"scopeSafe":true,"rollback":true}').verified,false);
});

test('deterministic diff guard blocks protected and oversized changes',()=>{
  assert.equal(reviewChangedFiles([{filename:'sites/example/app.css',additions:20,deletions:4}]).safe,true);
  const protectedReview=reviewChangedFiles([{filename:'auth-worker.js',additions:1,deletions:1}]);
  assert.equal(protectedReview.safe,false);
  assert.ok(protectedReview.reasons.includes('protected_boundary_changed'));
  const oversized=reviewChangedFiles(Array.from({length:SITE_IMPROVEMENT_POLICY.maxFiles+1},(_,i)=>({filename:'sites/x/'+i+'.css',additions:1,deletions:0})));
  assert.equal(oversized.safe,false);
});

test('migration extends privacy-preserving traffic activity and durable rotation ledger',async()=>{
  const sql=await readFile(new URL('../migrations/0109_low_traffic_site_improvement.sql',import.meta.url),'utf8');
  assert.match(sql,/ADD COLUMN last_seen_at/);
  assert.match(sql,/ADD COLUMN visit_count/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS ekodi_site_improvement_state/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS ekodi_site_improvement_runs/);
  assert.doesNotMatch(sql,/ip_address|user_agent|request_path/i);
});


test('production AI worker owns the hourly scheduler while staging stays passive',async()=>{
  const [prod,release,staging,worker]=await Promise.all([
    readFile(new URL('../wrangler.ai.toml',import.meta.url),'utf8'),
    readFile(new URL('../wrangler.ai.release.toml',import.meta.url),'utf8'),
    readFile(new URL('../wrangler.ai.staging.release.toml',import.meta.url),'utf8'),
    readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8'),
  ]);
  assert.match(prod,/\[triggers\][\s\S]*crons = \["5 \* \* \* \*"\]/);
  assert.match(release,/\[triggers\][\s\S]*crons = \["5 \* \* \* \*"\]/);
  assert.doesNotMatch(staging,/crons = \["5 \* \* \* \*"\]/);
  assert.match(worker,/async scheduled\(controller,env,ctx\)/);
  assert.match(worker,/runScheduledSiteImprovement/);
  assert.match(worker,/createdBy:'ekodi-site-improvement-scheduler'/);
  assert.match(worker,/\['codex','gemini-cli'\]\.find/);
});

test('low traffic decision uses recent active sessions and keeps cumulative visits informational',async()=>{
  const source=await readFile(new URL('../ekodi-site-improvement-scheduler.js',import.meta.url),'utf8');
  assert.match(source,/quiet:!!latestActivity&&recentSessions<=maxSessions/);
  assert.doesNotMatch(source,/quiet:!!latestActivity&&recentSessions<=maxSessions&&recentVisits<=maxVisits/);
  assert.ok(source.includes('platform-route-registry\\.js
});
));
});
