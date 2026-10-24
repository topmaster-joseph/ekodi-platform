#!/usr/bin/env node
/**
 * Per-site post-promotion verification ledger for the Shared Site Core deploy.
 *
 * Each post-promotion check runs independently (gated only on promotion), so one
 * site's failure no longer hides the others. This script records every check's
 * outcome per site and keeps the release-blocking contract: any check that did
 * not succeed (or was explicitly skipped by the quota guard) fails the job.
 *
 * Usage: record-post-promotion-verification.mjs --out=FILE -- 'site|check|stepId|outcome' ...
 * Outcomes come from GitHub `steps.<id>.outcome`. Anything other than
 * success/skipped (failure, cancelled, empty, unknown) is blocking — fail closed.
 */
import fs from 'node:fs';
import path from 'node:path';

const OK=new Set(['success']);
const NEUTRAL=new Set(['skipped']);

export function parseRow(row){
  const parts=String(row).split('|');
  if(parts.length!==4)throw new Error('malformed_verification_row');
  const [site,check,stepId,outcome]=parts.map(v=>v.trim());
  if(!/^[a-z0-9-]{1,40}$/.test(site)||!/^[a-z0-9-]{1,60}$/.test(check)||!/^[a-z0-9_]{1,60}$/.test(stepId)){
    throw new Error('malformed_verification_row');
  }
  const status=OK.has(outcome)?'passed':NEUTRAL.has(outcome)?'skipped':'failed';
  return {site,check,stepId,outcome:outcome||'missing',status};
}

export function buildLedger(rows,{releaseSha='',generatedAt=new Date().toISOString()}={}){
  if(!rows.length)throw new Error('no_verification_rows');
  const checks=rows.map(parseRow);
  const ids=new Set();
  for(const c of checks){
    if(ids.has(c.stepId))throw new Error('duplicate_verification_step');
    ids.add(c.stepId);
  }
  const sites={};
  for(const c of checks){
    const s=sites[c.site]||(sites[c.site]={status:'passed',passed:0,failed:0,skipped:0,checks:[]});
    s[c.status]++;
    s.checks.push(c.check);
    if(c.status==='failed')s.status='failed';
    else if(c.status==='skipped'&&s.status==='passed'&&s.passed===0)s.status='skipped';
  }
  for(const s of Object.values(sites))if(s.status==='skipped'&&s.passed>0)s.status='passed';
  const failed=checks.filter(c=>c.status==='failed');
  return {
    schema:'ekodi.post-promotion-verification.v1',
    releaseSha:String(releaseSha),
    generatedAt,
    blocking:failed.length>0,
    failedChecks:failed.map(c=>`${c.site}/${c.check}`),
    sites,
    checks,
  };
}

export function summaryMarkdown(ledger){
  const icon={passed:'✅',failed:'❌',skipped:'⏭️'};
  const lines=['## Post-promotion verification by site','',
    `Release SHA: \`${ledger.releaseSha||'unknown'}\` · blocking: **${ledger.blocking?'yes':'no'}**`,'',
    '| Site | Check | Step | Outcome |','|---|---|---|---|'];
  for(const c of ledger.checks)lines.push(`| ${c.site} | ${c.check} | ${c.stepId} | ${icon[c.status]} ${c.outcome} |`);
  return lines.join('\n')+'\n';
}

function main(argv){
  const sep=argv.indexOf('--');
  const opts=Object.fromEntries((sep<0?argv:argv.slice(0,sep)).filter(a=>a.startsWith('--')).map(a=>{const [k,...v]=a.slice(2).split('=');return [k,v.join('=')];}));
  const rows=sep<0?[]:argv.slice(sep+1);
  const ledger=buildLedger(rows,{releaseSha:process.env.RELEASE_SHA||''});
  const out=opts.out||'artifacts/post-promotion-verification.json';
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(ledger,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summaryMarkdown(ledger));
  for(const c of ledger.checks)console.log(`${c.status.padEnd(7)} ${c.site}/${c.check} (${c.stepId}: ${c.outcome})`);
  if(ledger.blocking){
    console.error(`Post-promotion verification failed: ${ledger.failedChecks.join(', ')}`);
    return 1;
  }
  return 0;
}

if(import.meta.url===`file://${process.argv[1]}`){
  try{process.exitCode=main(process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
