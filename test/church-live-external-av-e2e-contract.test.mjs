import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const workflow=read('.github/workflows/church-live-external-av-e2e.yml');
const e2e=read('scripts/tenant-live-production-e2e.mjs');

test('canonical external AV broadcast runs only with explicit owner approval',()=>{
  assert.match(workflow,/issue_comment:/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^\s*(?:push|workflow_run|schedule|pull_request|repository_dispatch):/m);
  assert.ok(workflow.includes("github.actor == 'topmaster-joseph'"));
  assert.ok(workflow.includes("github.event.comment.user.login == 'topmaster-joseph'"));
  assert.ok(workflow.includes("github.event.issue.number == 10054"));
  assert.ok(workflow.includes("/ekodi-church-external-av-e2e 2026-11-22"));
  assert.ok(workflow.includes("acknowledge_public_synthetic_broadcast == 'yes'"));
  assert.ok(workflow.includes("TENANT_LIVE_URL: https://ekodi.kr/live/church/"));
  assert.ok(workflow.includes("TENANT_LIVE_TENANT: ekodichurch"));
  assert.ok(workflow.includes("TENANT_LIVE_REQUIRE_AV: 'yes'"));
});

test('public synthetic run is bounded and never starts during protected worship or active live',()=>{
  assert.match(workflow,/timeout-minutes: 8/);
  assert.ok(workflow.includes("TZ=Asia/Seoul date +%u"));
  assert.ok(workflow.includes("10#$hm >= 930 && 10#$hm < 1300"));
  assert.ok(e2e.includes("if(initial.live)"));
  assert.ok(e2e.includes("process.exit(requireAV?2:0)"));
  assert.ok(e2e.includes("approved_external_av_requires_canonical_church_route"));
  assert.ok(e2e.includes("reason:'active_tenant_broadcast'"));
});

test('independent guest verifies audio, decoded progressing video, and clean termination',()=>{
  assert.match(e2e,/viewerContext=await browser.newContext\(\)/);
  assert.match(e2e,/viewer_received_no_live_track/);
  assert.match(e2e,/external_viewer_requires_video_and_audio/);
  assert.match(e2e,/external_viewer_video_must_decode_and_progress/);
  assert.match(e2e,/state\.remote|videoTracks:v\.srcObject/);
  assert.match(e2e,/report\.externalReceiver=/);
  assert.match(e2e,/status:'ended'/);
  assert.match(e2e,/if\(report\.roomId&&!report\.ended\)/);
  assert.match(e2e,/await browser\.close\(\)/);
  assert.match(workflow,/Revoke short-lived E2E session/);
  assert.match(workflow,/DELETE FROM sessions WHERE token_hash/);
  assert.match(workflow,/if: always\(\)/);
  assert.doesNotMatch(workflow,/pull_request_target:/);
});

test('GitHub issue evidence is redacted and emitted by a separate least-privilege reporting job',()=>{
  const report=workflow.slice(workflow.indexOf('\n  report-external-av:'));
  assert.ok(report.startsWith('\n  report-external-av:'));
  assert.match(report,/needs: church-live-external-av/);
  assert.match(report,/actions\/download-artifact@v4/);
  assert.match(report,/actions\/github-script@v7/);
  assert.match(report,/issues: write/);
  assert.match(report,/context\.runId/);
  assert.match(report,/issue_number: 10054/);
  assert.match(report,/r\.externalReceiver/);
  assert.doesNotMatch(report,/CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|E2E_ADMIN_TOKEN/);
});
