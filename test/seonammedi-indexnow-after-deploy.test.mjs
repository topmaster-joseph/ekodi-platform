import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/submit-seonammedi-indexnow.yml', import.meta.url), 'utf8');
const idn = 'xn--3e0b8b58jw4co4mnpll3k.kr';

test('IndexNow submission is re-triggered by successful official domain gateway releases', () => {
  assert.match(workflow, /workflow_run:\s+workflows: \['Deploy SeonamMedi Domain Gateway \(Manual Topology Change\)'\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
});

test('scheduled reconciliation submits only if the last official release is newer', () => {
  assert.match(workflow, /schedule:\s+\- cron: '[^']+'/);
  assert.match(workflow, /github\.event_name != 'workflow_run'/);
  assert.match(workflow, /GITHUB_EVENT_NAME\" != 'schedule'/);
  assert.match(workflow, /deploy-seonammedi-domains\.yml\/runs\?status=success&per_page=1/);
  assert.match(workflow, /submit-seonammedi-indexnow\.yml\/runs\?status=success&per_page=1/);
  assert.match(workflow, /submit=false/);
  assert.match(workflow, /steps\.decision\.outputs\.submit == 'true'/);
});

test('IndexNow requires the Korean canonical public domain and correct key, without elevated credentials', () => {
  assert.ok(workflow.includes("idn='" + idn + "'"));
  assert.match(workflow, /test "\$body" = "\$key"/);
  assert.match(workflow, /Sitemap: https:\/\/\$idn\/sitemap\.xml/);
  assert.match(workflow, /<link rel=/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_DNS_TXT_TOKEN|GOOGLE_SEARCH_SA_KEY_JSON/);
});
