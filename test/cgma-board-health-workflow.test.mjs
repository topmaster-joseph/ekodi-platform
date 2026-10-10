import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/cgma-board-health-watch.yml',import.meta.url),'utf8');
const probe=await readFile(new URL('../scripts/monitor-cgma-board.mjs',import.meta.url),'utf8');
test('CGMA independent health watch is hourly, read-only, and deduplicates incidents',()=>{
  assert.match(workflow,/cron: '17 \* \* \* \*'/);
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/issues: write/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/node scripts\/monitor-cgma-board\.mjs/);
  assert.match(workflow,/EKODI_CGMA_BOARD_WATCH_V1/);
  assert.match(workflow,/issues\.listForRepo/);
  assert.match(workflow,/if\(!previous\)/);
  assert.match(workflow,/issues\.update/);
  assert.match(workflow,/steps\.probe\.outcome != 'success'/);
  assert.doesNotMatch(workflow,/workflow_run:|deploy --config|cloudflare\/workers/);
});
test('monitor verifies independent identity and private membership access without writes',()=>{
  for(const path of ['/cgma/board','/cgma/board/api/health','/cgma/board/api/posts','/cgma/board/api/memberships'])assert.ok(probe.includes(path));
  assert.match(probe,/method: 'GET'/);
  assert.match(probe,/response\.headers\.get\('x-ekodi-board-independent'\)/);
  assert.match(probe,/response\.headers\.get\('x-ekodi-board-id'\)/);
  assert.match(probe,/return \{ path: target\.path, ok: \[401, 403\]\.includes\(status\)/);
  assert.match(probe,/const transient = new Set\(\[429, 500, 502, 503, 504\]\)/);
  assert.doesNotMatch(probe,/method: '(POST|PUT|DELETE|PATCH)'/);
});
