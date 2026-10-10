import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/deploy-admin-staging.yml', import.meta.url), 'utf8');
const deployment=workflow.slice(workflow.indexOf('      - name: Deploy isolated admin staging'), workflow.indexOf('      - name: Verify protected staging'));

test('isolated Admin staging retries only transient Cloudflare gateway responses',()=>{
  assert.match(deployment,/for attempt in 1 2 3; do/);
  assert.match(deployment,/wrangler@\$\{WRANGLER_VERSION\} deploy --config wrangler\.admin\.staging\.toml/);
  assert.match(deployment,/502 Bad Gateway\|503 Service Unavailable\|504 Gateway Timeout/);
  assert.match(deployment,/if \[ "\$attempt" -eq 3 \]; then/);
  assert.match(deployment,/sleep "\$\(\(attempt \* 8\)\)"/);
  assert.match(deployment,/set -euo pipefail/);
});

test('staging never retries rate limit, Cloudflare quota, unauthorized or policy failures',()=>{
  assert.match(deployment,/429\|1027\|rate\.limit\|quota\.exceeded\|insufficient\.permissions\|unauthorized\|forbidden/);
  assert.match(deployment,/quota, access or authorization restriction: do not retry/);
  assert.match(deployment,/failure is not a transient Cloudflare gateway response/);
  assert.match(workflow,/node "\$GITHUB_WORKSPACE\/scripts\/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(workflow,/CLOUDFLARE_DEVELOPMENT_API_TOKEN/);
  assert.match(workflow,/Admin staging must use EKODI Development/);
  assert.match(workflow,/productionTraffic":false/);
  assert.match(workflow,/Www-Authenticate: Cloudflare-Access/);
  assert.match(workflow,/Verify protected staging/);
});
