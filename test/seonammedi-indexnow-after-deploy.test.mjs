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

test('daily reconciliation submits live database-published notices even with no new Worker deployment', () => {
  assert.match(workflow, /schedule:\s+\- cron: '31 0 \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /echo 'submit=true' >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /steps\.decision\.outputs\.submit == 'true'/);
  assert.match(workflow, /Reconciling published Korean canonical sitemap/);
  // No extra GitHub REST calls per day: hourly API-budget exhaustion
  // previously blocked status publication and protected merges.
  assert.doesNotMatch(workflow, /GH_TOKEN:/);
  assert.doesNotMatch(workflow, /deploy-seonammedi-domains\.yml\/runs\?status=success/);
  assert.doesNotMatch(workflow, /submit-seonammedi-indexnow\.yml\/runs\?status=success/);
  assert.doesNotMatch(workflow, /submit=false/);
});

test('IndexNow requires the Korean canonical public domain and correct key, without elevated credentials', () => {
  assert.ok(workflow.includes("idn='" + idn + "'"));
  assert.match(workflow, /test "\$body" = "\$key"/);
  assert.match(workflow, /Sitemap: https:\/\/\$idn\/sitemap\.xml/);
  assert.match(workflow, /<link rel=/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_DNS_TXT_TOKEN|GOOGLE_SEARCH_SA_KEY_JSON/);
});

test('IndexNow preflight downloads full SEO responses before checking, avoiding curl SIGPIPE exit 23', () => {
  assert.match(workflow, /probe_dir=\$\(mktemp -d\)/);
  assert.match(workflow, /curl -fsS --retry 3 --retry-delay 2 -o "\$probe_dir\/robots"/);
  assert.match(workflow, /curl -fsS --retry 3 --retry-delay 2 -o "\$probe_dir\/sitemap"/);
  assert.match(workflow, /curl -fsS --retry 3 --retry-delay 2 -o "\$probe_dir\/home"/);
  assert.match(workflow, /grep -Fq .*"\$probe_dir\/sitemap"/);
  assert.doesNotMatch(workflow, /^\s*curl[^\n]*\|\s*grep -Fq/m);
});
