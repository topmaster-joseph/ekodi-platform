import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/points-staging-access.mjs','utf8');
const wf=fs.readFileSync('.github/workflows/verify-points-staging-browser.yml','utf8');

test('ephemeral Access token is development-only and run-scoped', ()=>{
  assert.match(script,/DEVELOPMENT_ACCOUNT='46aad4738793fbaca88574832a2ccc0f'/);
  assert.match(script,/decision:'non_identity'/);
  assert.match(script,/duration:'24h'/);
  assert.match(script,/::add-mask::/);
  assert.doesNotMatch(script,/6986fd633f4e33bf804c921697b2d797/);
  assert.doesNotMatch(script,/\.ekodi\.kr/);
});

test('refuses a non-development account', ()=>{
  const r=spawnSync(process.execPath,['scripts/points-staging-access.mjs','open'],{env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'6986fd633f4e33bf804c921697b2d797',CLOUDFLARE_API_TOKEN:'x',POINTS_E2E_RUN:'1'},encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/development Cloudflare account required/);
});

test('workflow issues the token when secrets are absent and always removes it', ()=>{
  assert.match(wf,/node scripts\/points-staging-access\.mjs open/);
  assert.match(wf,/if: always\(\) && env\.E2E_ACCESS_EPHEMERAL == '1'\n\s+run: node scripts\/points-staging-access\.mjs close/);
  assert.doesNotMatch(wf,/for name in [^\n]*CF_ACCESS_CLIENT_ID/);
});
