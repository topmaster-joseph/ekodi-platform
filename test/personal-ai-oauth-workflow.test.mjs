import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/configure-personal-ai-oauth.yml',import.meta.url),'utf8');
const mcp=await readFile(new URL('../ekodi-mcp-gateway.js',import.meta.url),'utf8');

test('production OAuth is bounded and dynamic client registration is not default-open',()=>{
  assert.match(workflow,/oauth_server_enabled\\?":true|oauth_server_enabled":true/);
  assert.match(workflow,/oauth_server_allow_dynamic_registration\\?":false|oauth_server_allow_dynamic_registration":false/);
  assert.match(workflow,/oauth_server_authorization_path\\?":\\?"\/oauth\/consent/);
  assert.match(workflow,/ekodi_mcp_access_token_hook/);
  assert.match(workflow,/cron: '17 \* \* \* \*'/);
  assert.match(workflow,/Probe current OAuth server state/);
  assert.match(workflow,/OAUTH_STATE=bootstrap_required/);
  assert.match(workflow,/Automatic hourly recovery is armed/);
});

test('MCP adapter targets the current stateless protocol while retaining legacy compatibility',()=>{
  assert.match(mcp,/const PROTOCOL_VERSION='2026-07-28'/);
  assert.match(mcp,/method==='server\/discover'/);
  assert.match(mcp,/ttlMs:300000/);
  assert.match(mcp,/method==='initialize'/);
});
