import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const aiops = readFileSync(new URL('../ai-ops-admin.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../admin-readable-command.css', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../admin-provider-control.js', import.meta.url), 'utf8');
const readable = readFileSync(new URL('../admin-readable-command.js', import.meta.url), 'utf8');

test('AI Ops provides five mutually exclusive progressive views with accessible button state', () => {
  for (const stage of ['overview','providers','sites','reports','command']) {
    assert.match(aiops, new RegExp('data-aiops-stage-tab="' + stage + '"'));
    assert.match(css, new RegExp('data-aiops-stage="' + stage + '"'));
  }
  assert.match(aiops, /function setStage\(requested\)/);
  assert.match(aiops, /Object\.prototype\.hasOwnProperty\.call\(STAGE_LABELS, requested\)/);
  assert.match(aiops, /button\.setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(aiops, /ArrowLeft','ArrowRight','Home','End/);
  assert.match(aiops, /section\.dataset\.aiopsStage = 'overview'/);
  assert.match(css, /AIOPS-STAGED-WORKSPACE-20261029/);
});

test('overview counts and urgent items come from control APIs rather than sample numbers', () => {
  assert.match(aiops, /renderStageSummary\(data\)/);
  assert.match(aiops, /const issues = data\.cases\.slice\(0, 5\)/);
  assert.match(aiops, /Boolean\(overview\?\.generatedAt\) && !monitorFreshness\(\)\.stale/);
  assert.match(aiops, /운영 집계 확인 필요/);
  assert.match(aiops, /실제 연결이 확인되지 않은 사이트는 연결대기로 표시합니다/);
  assert.match(aiops, /metric\('전체 사이트',/);
  assert.match(aiops, /renderStageSummary\(data\);/);
});

test('site rows stay single line on desktop and only disclose detail after selection', () => {
  assert.match(aiops, /let selectedDetailOpen = false/);
  assert.match(aiops, /detail\.hidden = requested !== 'sites' \|\| !selectedDetailOpen/);
  assert.match(aiops, /selectedDetailOpen = true;\s+setStage\('sites'\)/);
  assert.match(css, /\.ai-fleet-table thead \{display:block!important/);
  assert.match(css, /grid-template-areas:"site status response check issue"/);
  assert.match(css, /@media\(max-width:1000px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('separate panels are hidden only by the stage, preserving provider tab actions', () => {
  assert.match(css, /data-aiops-stage="providers"\] > \[data-ekodi-ai-provider-center\]/);
  assert.match(css, /data-aiops-stage="command"\] \.ai-ops-main > \.ai-chief-chat/);
  assert.match(css, /data-aiops-stage="reports"\] \.ai-ops-main > \.ai-evolution-block/);
  assert.match(css, /data-aiops-stage="sites"\] \.ai-ops-main > \.ai-ops-observe/);
  assert.match(provider, /const views=\[\['operations','운영 현황'\]/);
  assert.match(provider, /x-ekodi-confirm-impact':'ai-provider-secret-connect/);
  assert.match(provider, /x-ekodi-confirm-impact':'ai-provider-route-update/);
  assert.match(provider, /x-ekodi-confirm-impact':'ai-provider-runtime-update/);
  assert.match(readable, /actionType:'ui\.change_request'/);
});
