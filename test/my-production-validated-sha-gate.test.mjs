import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/deploy-my.yml',import.meta.url),'utf8');
const validate=workflow.split('\n  validate:\n')[1]?.split('\n  staging:\n')[0]||'';
const staging=workflow.split('\n  staging:\n')[1]?.split('\n  production:\n')[0]||'';
const production=workflow.split('\n  production:\n')[1]||'';

test('dispatch validates fresh main instead of the old workflow event SHA',()=>{
  assert.ok(validate.includes("ref: ${{ github.event_name == 'pull_request' && github.sha || 'main' }}"));
  assert.ok(validate.includes('validated_sha: ${{ steps.source.outputs.sha }}'));
  assert.ok(validate.includes('id: source'));
  assert.ok(validate.includes('git rev-parse HEAD'));
  assert.ok(validate.indexOf('Record exact validated My source')<validate.indexOf('Validate My EKODI contracts'));
  assert.ok(production.includes('ref: ${{ needs.validate.outputs.validated_sha }}'));
});

test('production refuses stale checkout before mutations and deployment',()=>{
  assert.ok(production.includes("test \"$GITHUB_REF\" = 'refs/heads/main'"));
  assert.ok(production.includes('test "$(git rev-parse HEAD)" = "$EKODI_VALIDATED_SHA"'));
  assert.ok(production.includes('git ls-remote --exit-code origin refs/heads/main'));
  assert.ok(production.includes('if [ "$current_main" != "$EKODI_VALIDATED_SHA" ]; then'));
  const guard=production.indexOf('Refuse stale or unvalidated My production checkout');
  const schema=production.indexOf('Ensure digital card contact-exchange schema');
  const cloudflare=production.indexOf('Bootstrap, migrate legacy page, or run guarded release');
  const second=production.indexOf('Recheck My release source before Cloudflare promotion');
  assert.ok(guard>=0&&guard<schema&&second>schema&&second<cloudflare);
  assert.ok(production.includes('My main moved during preflight'));
});

test('status receipt is recorded on validated source, not old event SHA',()=>{
  const start=production.indexOf('Publish My EKODI production status');
  assert.ok(start>=0);
  const receipt=production.slice(start);
  assert.ok(receipt.includes('EKODI_VALIDATED_SHA: ${{ needs.validate.outputs.validated_sha }}'));
  assert.ok(receipt.includes('/statuses/${EKODI_VALIDATED_SHA}'));
  assert.ok(!receipt.includes('/statuses/${GITHUB_SHA}'));
});

test('staging remains pull-request-only and isolated',()=>{
  assert.ok(staging.includes("github.event_name == 'pull_request'"));
  assert.ok(staging.includes('CLOUDFLARE_DEVELOPMENT_API_TOKEN'));
  assert.ok(staging.includes('wrangler.my.staging.toml'));
  assert.ok(production.includes("github.event_name != 'pull_request'"));
  assert.ok(production.includes('environment: production'));
  assert.ok(!validate.includes('secrets.CLOUDFLARE_API_TOKEN'));
});
