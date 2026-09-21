import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('post-deploy Admin visual E2E is automatic only for visual-contract changes', async () => {
  const workflow = await read('.github/workflows/verify-admin-visual-production.yml');
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \['Deploy EKODI Shared Site Core'\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /Detect Admin visual-contract changes/);
  assert.match(workflow, /admin-conversation-workbench\\\.css/);
  assert.match(workflow, /admin_visual=true/);
  assert.match(workflow, /steps\.changes\.outputs\.admin_visual == 'true'/);
  assert.match(workflow, /node scripts\/admin-assist-canonical-e2e\.mjs/);
  assert.match(workflow, /admin-home-visual\.png/);
  assert.match(workflow, /retention-days: 30/);
});

test('automatic visual E2E keeps its session short-lived and always revokes it', async () => {
  const workflow = await read('.github/workflows/verify-admin-visual-production.yml');
  assert.match(workflow, /expires=\$\(date -u -d '\+15 minutes'/);
  assert.match(workflow, /role='super_admin'/);
  assert.match(workflow, /E2E_ADMIN_TOKEN=\$token/);
  assert.match(workflow, /DELETE FROM sessions WHERE token_hash/);
  assert.match(workflow, /if: always\(\) && env\.E2E_AUTH_DB_ID != '' && env\.E2E_TOKEN_HASH != ''/);
});

test('canonical Assist E2E proves the rendered light workbench before command delivery', async () => {
  const source = await read('scripts/admin-assist-canonical-e2e.mjs');
  assert.match(source, /visualContractVerified: false/);
  assert.match(source, /admin-command-home/);
  assert.match(source, /admin-command-active/);
  assert.match(source, /bodyBackground !== 'rgb\(255, 255, 255\)'/);
  assert.match(source, /sidebarBackground !== 'rgb\(247, 248, 252\)'/);
  assert.match(source, /composerRadius !== '32px'/);
  assert.match(source, /radial-gradient/);
  assert.match(source, /admin-home-visual\.png/);
  assert.match(source, /report\.visualContractVerified = true/);
});
