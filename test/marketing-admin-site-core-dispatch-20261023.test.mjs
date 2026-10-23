import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const siteCore=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

// Orchestrated token merges do not wake push workflows. MarketingAI admin console assets are
// owned by Site Core, so a merged change to them must dispatch deploy-site-core explicitly.
test('MarketingAI admin console changes dispatch the Site Core release',()=>{
  const start=source.indexOf('const sharedSiteTouched=');
  const end=source.indexOf(');\n',start);
  assert.ok(start>=0&&end>start,'Site Core dispatch selector required');
  const selector=source.slice(start,end);
  for(const file of ['marketing-ai-admin.js','marketing-ai-admin.css','marketing-ai-admin-live-ops.js','marketing-ai-channel-manager.js'])
    assert.ok(selector.includes("'"+file+"'"),file);
  assert.ok(source.includes("'/actions/workflows/deploy-site-core.yml/dispatches'"));
  assert.ok(siteCore.includes("'marketing-ai-admin.js'"),'Site Core owns the MarketingAI admin console asset');
});
