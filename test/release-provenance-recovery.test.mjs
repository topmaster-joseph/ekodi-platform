import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {findExactHumanGateApproval} from '../scripts/release-human-gate-evidence.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

// Owner decision (topmaster-joseph, 2026-10-19): remove the per-PR human
// approval comment/label. Exact-SHA required CI, guarded deploys and production
// verification remain the release gate; legacy approvals are still recorded.
test('release provenance recovery runs on owner standing delegation, gated by exact-SHA CI',async()=>{
  const source=await read('scripts/recover-release-provenance.mjs');
  for(const marker of [
    "APPROVAL_LABEL='orchestrator-human-gate-approved'",
    "APPROVAL_MARKER_PREFIX='EKODI-HUMAN-GATE-APPROVE:'",
    "owner-removed-per-pr-human-gate-20261019",
    "owner_standing_delegation_ci_gated",
    "exact_sha_human_gate_approved",
    "sourceSha:headSha",
    "humanApproval",
    "intent,target,'high'",
    "human_gate_required",
    "existing recovery branch does not match the exact approved source SHA",
  ]) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/waiting-human-approval-label/);
  assert.doesNotMatch(source,/waiting-exact-sha-human-approval/);
  assert.match(source,/findExactHumanGateApproval\(/,'legacy approval evidence is still recorded when present');
  assert.match(source,/const requiredChecks=\['test','EKODI AI Orchestration Gate'\]/);
  assert.match(source,/authentic_required_checks_not_green/,'no merge before exact-SHA CI is green');
  assert.match(source,/github-owner:\$\{approvalActor\}/);
  assert.doesNotMatch(source,/intent,target,'normal','delegated'/);
});

test('trusted recovery workflow runs without an approval label and executes only default-branch runtime',async()=>{
  const workflow=await read('.github/workflows/recover-release-provenance.yml');
  assert.match(workflow,/pull_request_target:/);
  assert.match(workflow,/types: \[opened, reopened, synchronize, ready_for_review, labeled\]/);
  assert.match(workflow,/head\.repo\.full_name == github\.repository/);
  assert.match(workflow,/github\.event\.pull_request\.draft == false/,'draft PRs never release');
  assert.doesNotMatch(workflow,/contains\(github\.event\.pull_request\.labels\.\*\.name, 'orchestrator-human-gate-approved'\)/);
  assert.match(workflow,/!contains\(github\.event\.pull_request\.head\.ref, '\/orch_'\)/);
  assert.match(workflow,/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow,/CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow,/node scripts\/recover-release-provenance\.mjs/);
  assert.doesNotMatch(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

test('exact-SHA recovery does not strand approved independent-board production release after token merge',async()=>{
  const [script,workflow]=await Promise.all([
    read('scripts/recover-release-provenance.mjs'),
    read('.github/workflows/recover-release-provenance.yml')
  ]);
  assert.match(workflow,/permissions:[\s\S]*actions: write/);
  assert.match(workflow,/independent_board_dispatch/);
  assert.match(script,/source file inspection failed before guarded merge/);
  assert.match(script,/sourceFiles\.some\(file=>/);
  for(const owner of [
    "file.startsWith('services/independent-board/')",
    "file==='wrangler.independent-board.toml'",
    "file==='sites/seonammedi/public/app.js'",
    "file==='.github/workflows/deploy-independent-board.yml'"
  ]) assert.ok(script.includes(owner),owner);
  assert.match(script,/if\(merge\.response\.ok&&\(independentBoardTouched\|\|shellRuntimeTouched\|\|sharedSiteTouched\)\)\{/);
  assert.match(script,/merge\.data\?\.merged!==true/);
  assert.match(script,/main\.data\?\.commit\?\.sha/);
  assert.match(script,/main changed before exact service dispatch/);
  assert.match(script,/actions\/workflows\/deploy-independent-board\.yml\/dispatches/);
  assert.match(script,/release_branch_ref:branchRef,release_task_id:taskId/);
  assert.match(script,/dispatch\.response\.status!==204/);
  const guarded=script.indexOf('if(merge.response.ok&&(independentBoardTouched||shellRuntimeTouched||sharedSiteTouched)){');
  const dispatch=script.indexOf('/actions/workflows/deploy-independent-board.yml/dispatches');
  assert.ok(guarded>=0&&dispatch>guarded,'dispatch must be behind verified immediate merge');
  assert.doesNotMatch(script,/sourceFiles\.some\([\s\S]*?\)\s*\?\s*await\s+github\(/);
});

test('recovery immediate merge requires authentic exact SHA CI and source containing current protected main',async()=>{
  const [script,workflow]=await Promise.all([
    read('scripts/recover-release-provenance.mjs'),
    read('.github/workflows/recover-release-provenance.yml')
  ]);
  assert.match(workflow,/checks: read/);
  assert.match(workflow,/statuses: read/);
  assert.match(script,/commits\/\$\{headSha\}\/status/);
  assert.match(script,/commits\/\$\{headSha\}\/check-runs\?per_page=100/);
  assert.match(script,/run\.app\?\.slug==='github-actions'/);
  assert.match(script,/requiredChecks=\['test','EKODI AI Orchestration Gate'\]/);
  assert.match(script,/Number\(currentBase\.data\?\.behind_by\)===0/);
  assert.match(script,/const merge=checksReady&&upToDate/);
  assert.match(script,/status:412/);
  assert.match(script,/guarded-pending-http/);
  assert.doesNotMatch(script,/if\(!checksReady\)\s*merge=await github/);
});

test('receipt-bound immediate Shell dispatch occurs only after confirmed protected main merge',async()=>{
  const script=await read('scripts/recover-release-provenance.mjs');
  const orchestration=script.indexOf('const shellRuntimeTouched=sourceFiles.some');
  const merged=script.indexOf('if(merge.response.ok&&(independentBoardTouched||shellRuntimeTouched||sharedSiteTouched)){');
  const checkMain=script.indexOf('main changed before exact service dispatch');
  const shell=script.indexOf('if(shellRuntimeTouched){',merged);
  const dispatch=script.indexOf('/actions/workflows/deploy-ekodi-shell.yml/dispatches',shell);
  const accepted=script.indexOf("out('shell_dispatch','accepted')",dispatch);
  assert.ok(orchestration>0&&merged>orchestration&&checkMain>merged&&shell>checkMain&&dispatch>shell&&accepted>dispatch);
  assert.match(script,/file\.startsWith\('shell\/'\)/);
  assert.match(script,/release_branch_ref:branchRef,release_task_id:taskId/);
  assert.match(script,/shellDispatch\.response\.status!==204/);
  assert.match(script,/if\(merge\.data\?\.merged!==true/);
  assert.match(script,/out\('independent_board_dispatch','accepted'\)/);
  assert.doesNotMatch(script,/method:'POST'[^\n]*https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[^\n]*workers/);
});

test('owner-approved immediate CGMA apex recovery dispatches only exact scoped source after protected merge',async()=>{
  const [script,workflow]=await Promise.all([
    read('scripts/recover-release-provenance.mjs'),
    read('.github/workflows/recover-release-provenance.yml')
  ]);
  const scope=script.indexOf("const cgmaApexTouched=sourceFiles.includes('.github/workflows/deploy-cgma-apex-edge.yml')");
  const verified=script.indexOf('if(merge.response.ok&&cgmaApexTouched){');
  const mainCheck=script.indexOf('main changed before exact CGMA apex dispatch',verified);
  const dispatch=script.indexOf('/actions/workflows/deploy-cgma-apex-edge.yml/dispatches',verified);
  const accepted=script.indexOf("out('cgma_apex_dispatch','accepted')",dispatch);
  assert.ok(scope>0&&verified>scope&&mainCheck>verified&&dispatch>mainCheck&&accepted>dispatch);
  assert.ok(script.includes('merge.data?.merged!==true'));
  assert.ok(script.includes('cgmaDispatch.response.status!==204'));
  assert.ok(script.includes('release_branch_ref:branchRef,release_task_id:taskId'));
  assert.ok(script.includes('if(merge.response.ok&&cgmaApexTouched){'));
  assert.match(workflow,/actions: write/);
  assert.match(workflow,/cgma_apex_dispatch/);
  assert.doesNotMatch(script,/const cgmaApexTouched=true/);
  assert.ok(!script.includes('if(!merge.response.ok&&cgmaApexTouched){'));
});

test('Human Gate rejects quoted markers and ensures exact owner approval precedes a real label event',()=>{
  const marker='EKODI-HUMAN-GATE-APPROVE:'+'a'.repeat(40);
  const comment=(body,user='owner',created='2026-10-15T12:00:00Z',updated=created)=>({
    body,user:{login:user,type:'User'},created_at:created,updated_at:updated
  });
  const label=(created,event='labeled')=>({
    event,label:{name:'orchestrator-human-gate-approved'},created_at:created
  });
  const verify=(comments,events)=>findExactHumanGateApproval({
    comments,events,policyOwners:['owner'],approvalMarker:marker,
    approvalLabel:'orchestrator-human-gate-approved'
  });
  const later=[label('2026-10-15T12:01:00Z')];
  assert.equal(verify([comment('Please enter '+marker+' yourself.')],later),null);
  assert.equal(verify([comment(marker,'non-owner')],later),null);
  assert.equal(verify([comment(marker+'\\nextra text')],later),null);
  assert.equal(verify([comment(marker)],[label('2026-10-15T11:59:00Z')]),null);
  assert.equal(verify([comment(marker)],[]),null);
  assert.equal(verify([comment(marker,'owner','2026-10-15T12:00:00Z','2026-10-15T12:02:00Z')],later),null);
  assert.equal(verify([comment(marker.slice(0,-1)+'0')],later),null);
  assert.equal(verify([comment(' '+marker+' ')],later),null);
  assert.equal(verify([comment(marker+'\n')],later),null);
  const approved=verify([comment(marker)],later);
  assert.equal(approved?.approvalComment?.user?.login,'owner');
  assert.equal(approved?.labelEvent?.created_at,'2026-10-15T12:01:00Z');
});

test('exact-approved immediate merge deploys shared Site Core through guarded receipt-bound workflow',async()=>{
  const [script,workflow]=await Promise.all([
    read('scripts/recover-release-provenance.mjs'),
    read('.github/workflows/recover-release-provenance.yml')
  ]);
  const source=script.indexOf('const sharedSiteTouched=sourceFiles.some');
  const protectedMerge=script.indexOf('if(merge.response.ok&&(independentBoardTouched||shellRuntimeTouched||sharedSiteTouched)){');
  const verifyMain=script.indexOf('main changed before exact service dispatch',protectedMerge);
  const dispatch=script.indexOf('/actions/workflows/deploy-site-core.yml/dispatches',verifyMain);
  const receipt=script.indexOf('release_branch_ref:branchRef,release_task_id:taskId',dispatch);
  const responseCheck=script.indexOf('siteDispatch.response.status!==204',receipt);
  const output=script.indexOf("out('shared_site_dispatch','accepted')",responseCheck);
  assert.ok(source>0&&protectedMerge>source&&verifyMain>protectedMerge&&dispatch>verifyMain&&receipt>dispatch&&responseCheck>receipt&&output>responseCheck);
  assert.match(script,/file\.startsWith\('sites\/seonammedi\/public\/'\)/);
  assert.ok(script.includes("'seonammedi-admin-control.js'"));
  assert.match(script,/file==='wrangler.independent-board.toml'/);
  assert.match(script,/merge\.data\?\.merged!==true/);
  assert.match(script,/main\.data\?\.commit\?\.sha/);
  assert.match(script,/sharedSiteTouched\)\)\{/);
  assert.match(workflow,/shared_site_dispatch/);
  assert.doesNotMatch(script,/const sharedSiteTouched=true/);
});
