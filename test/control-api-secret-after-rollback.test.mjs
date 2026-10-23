import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');
const step=workflow.slice(workflow.indexOf('- name: Provision SeonamMedi hourly crawl dispatch token'),workflow.indexOf('- name: Record configured AI providers'));

// A rolled-back guarded candidate leaves the latest Worker version undeployed; Cloudflare then
// refuses `secret put`. The always-run token step must not block every later production deploy.
test('SeonamMedi token provisioning survives an undeployed latest Worker version',()=>{
  assert.match(step,/secret put SEONAMMEDI_DISPATCH_TOKEN --config wrangler\.api\.toml >\/dev\/null 2>\/tmp\/seonammedi-secret\.err; then/);
  assert.match(step,/versions secret put SEONAMMEDI_DISPATCH_TOKEN --config wrangler\.api\.toml/);
  assert.ok(step.indexOf('versions secret put')>step.indexOf('else'),'fallback only after the in-place edit fails');
  assert.doesNotMatch(step,/echo "\$SEONAMMEDI_DISPATCH_TOKEN"|cat \/tmp\/seonammedi-secret\.err/,'never print the token or raw errors');
  // The guarded release still runs after this step and promotes the staged version.
  assert.ok(workflow.indexOf('Guarded 0-percent Control candidate then promote')>workflow.indexOf('Provision SeonamMedi hourly crawl dispatch token'));
});
