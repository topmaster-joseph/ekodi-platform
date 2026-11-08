import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const native=readFileSync(new URL('../.github/workflows/ekodi-native-operations-watch.yml',import.meta.url),'utf8');
const fallback=readFileSync(new URL('../.github/workflows/satellite-retirement-readonly-audit.yml',import.meta.url),'utf8');
const registry=JSON.parse(readFileSync(new URL('../config/ekodi-native-monitoring-ownership.json',import.meta.url),'utf8'));

test('EKODI is the sole scheduled owner: its existing daily cron, no duplicate satellite cron',()=>{
  assert.match(native,/name: EKODI Native Operations Watch/);
  assert.match(native,/cron: '45 23 \* \* \*'/);
  assert.match(native,/EKODI Orchestrator daily satellite source and independent release audit/);
  assert.match(native,/github\.event\.schedule == '45 23 \* \* \*'/);
  assert.doesNotMatch(fallback,/\n  schedule:|\n  push:/);
  assert.match(fallback,/\bon:\n  workflow_dispatch:/);
  assert.match(fallback,/if: github\.ref == 'refs\/heads\/main'/);
});

test('EKODI orchestrator native monitor launches bounded read-only runner and retains artifact',()=>{
  assert.match(native,/node --check scripts\/run-ekodi-satellite-retirement-audit\.mjs/);
  assert.match(native,/test\/ekodi-satellite-retirement-audit\.test\.mjs/);
  assert.match(native,/scripts\/run-ekodi-satellite-retirement-audit\.mjs/);
  assert.match(native,/--output-dir=ekodi-satellite-audit/);
  assert.match(native,/cat ekodi-satellite-audit\/summary\.md >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(native,/ekodi-satellite-audit\//);
  assert.match(native,/actions\/upload-artifact@v7/);
  assert.match(native,/if: always\(\) && \(github\.event\.schedule == '45 23 \* \* \*' \|\| github\.event_name == 'workflow_dispatch' \|\| github\.event\.schedule == '37 \* \* \* \*'\)/);
  assert.match(native,/kst_hour="\$\(TZ=Asia\/Seoul date \+%H\)"/);
  assert.match(native,/\^\(09\|10\|11\)\$/);
  assert.match(native,/outside its 09-11 KST recovery window/);
  assert.equal((native.match(/cron: '37 \* \* \* \*'/g)||[]).length,1,'recovery must reuse existing hourly cron');
  assert.equal((native.match(/cron: '45 23 \* \* \*'/g)||[]).length,1,'existing 08:45 daily cron remains sole daily owner');
});

test('manual recovery audit stays protected main, least privilege, no independent scheduler or mutation',()=>{
  assert.match(fallback,/permissions:\n  contents: read/);
  assert.match(fallback,/persist-credentials: false/);
  assert.match(fallback,/--mode=manual --output-dir=ekodi-satellite-audit/);
  assert.match(fallback,/actions\/upload-artifact@v4/);
  assert.match(fallback,/test\/satellite-live-source-markers\.test\.mjs/);
  assert.match(fallback,/test\/satellite-retirement-watch-report\.test\.mjs/);
  assert.doesNotMatch(fallback,/(secrets\.|wrangler(?:@|\s)|gh repo delete|gh api -X DELETE|repository_dispatch|contents: write|GITHUB_TOKEN|pull-requests: write)/);
  assert.doesNotMatch(native,/(contents: write|issues: write|id-token: write)/);
});

test('native registry owns audit and disclaims unverified runtime or repo-deletion authority',()=>{
  assert.equal(registry.operator,'ekodi-orchestrator');
  const handoff=registry.monitoring.find(x=>x.formerTask.includes('6개 레거시 저장소'));
  assert.ok(handoff);
  assert.match(handoff.nativeOwner,/EKODI Orchestrator/);
  assert.deepEqual(handoff.schedules,['.github/workflows/ekodi-native-operations-watch.yml']);
  assert.equal(handoff.frequency,'daily_0845_kst');
  assert.equal(handoff.handoffState,'native-scheduler-source-wired-runtime-receipt-pending');
  assert.equal(registry.guardrails.readOnlyMonitoring,true);
  assert.equal(registry.guardrails.noAutomaticReleaseWithoutHumanGate,true);
  assert.doesNotMatch(JSON.stringify(handoff),/\.github\/workflows\/satellite-retirement-readonly-audit\.yml/);
});

test('missed cron recovers from a trusted EKODI main schedule without another scheduler or privilege',()=>{
  assert.ok(native.includes("workflow_run:\n    workflows: ['Reconcile EKODI Church Production']\n    types: [completed]"));
  assert.ok(native.includes("if: github.event_name != 'pull_request' && github.event_name != 'workflow_run'"));
  const block=native.slice(native.indexOf('  recover-satellite-audit:'));
  assert.ok(block.startsWith('  recover-satellite-audit:'),'trusted recovery job is required');
  for(const guard of [
    "github.event.workflow_run.event == 'schedule'",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.head_branch == 'main'",
    "TZ=Asia/Seoul date +%H",
    "^(09|10|11)$",
    "steps.window.outputs.eligible == 'true'",
    "persist-credentials: false",
    "node scripts/run-ekodi-satellite-retirement-audit.mjs --mode=daily --output-dir=ekodi-satellite-audit",
    "ekodi-satellite-recovery-",
    "retention-days: 14"
  ])assert.ok(block.includes(guard),'missing read-only recovery gate '+guard);
  assert.doesNotMatch(block,/secrets\.|wrangler|gh api -X|github\.rest\.pulls\.merge|contents: write|pull-requests: write|id-token: write/);
  assert.equal((native.match(/cron: '/g)||[]).length,4,'preserve existing 4 cron registrations; add zero');
});
