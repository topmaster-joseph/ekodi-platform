import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/verify-native-user4-acceptance.mjs',import.meta.url),'utf8');

test('passive postdeploy and cron checks cannot cancel active approved USER4 verification',()=>{
  assert.match(workflow,/group: device-agent-production-verification-\$\{\{ github\.ref \}\}-\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.execution_mode \|\| 'passive' \}\}/);
  assert.match(workflow,/cancel-in-progress: \$\{\{ github\.event_name != 'workflow_dispatch' \}\}/);
  assert.match(workflow,/execution_mode == 'user4-acceptance'/);
  assert.match(workflow,/run: node scripts\/verify-native-user4-acceptance\.mjs/);
});
test('USER4 acceptance output independently discloses confirmed safe agent refresh',()=>{
  assert.match(source,/ensureUser4AgentUpdated\(\{token\}\)/);
  assert.match(source,/nativeAgentUpdateVerified:update\.recentOfficialUpdateVerified===true/);
  assert.match(source,/ownerRefreshFloor:new Date\(USER4_CDP_FIX_FLOOR\)\.toISOString\(\)/);
  assert.match(source,/USER4_CDP_FIX_FLOOR = Date\.parse\('2026-10-16T00:00:00\.000Z'\)/);
});
