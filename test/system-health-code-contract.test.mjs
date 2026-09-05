import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('System Health exposes code and architecture health without autonomous repair', async () => {
  const [admin, control, worker, menu, audit, workflow] = await Promise.all([
    read('system-health-admin.js'),
    read('system-health-control.js'),
    read('mission-control-entry-worker.js'),
    read('admin-menu-registry.js'),
    read('scripts/system-health-code-audit.mjs'),
    read('.github/workflows/system-health-code-audit.yml')
  ]);

  assert.match(menu, /id: 'health'[^\n]*group: 'operations-center'[^\n]*ko: '상태·관측'/);
  assert.match(admin, /CODE & ARCHITECTURE HEALTH/);
  assert.match(admin, /data-code-health-score/);
  assert.match(admin, /api\/control\/system-health\/code/);
  assert.match(control, /system-health-data\/system-health-code-report\.json/);
  assert.match(control, /SYSTEM_HEALTH_CODE_SCHEMA/);
  assert.match(worker, /path\.startsWith\('\/api\/control\/system-health'\)/);
  assert.match(audit, /maintenancePolicy/);
  assert.match(audit, /publicSummaryOnly:true/);
  assert.match(workflow, /cron: '10 0 \* \* 1'/);
  assert.match(workflow, /system-health-data/);

  assert.doesNotMatch(admin, /자동 수정 실행/);
  assert.doesNotMatch(control, /DELETE\s+FROM/i);
});

test('Code health score keeps the agreed seven dimensions and 100-point total', async () => {
  const audit = await read('scripts/system-health-code-audit.mjs');
  for (const marker of ['tests:25', 'duplication:15', 'complexity:15', 'security:15', 'architecture:15', 'deployment:10', 'documentation:5']) {
    assert.ok(audit.includes(marker), `missing weight: ${marker}`);
  }
  assert.match(audit, /healthy:90/);
  assert.match(audit, /watch:80/);
  assert.match(audit, /maintenance:70/);
  assert.match(audit, /function collapseDuplicateGroups/);
  assert.match(audit, /collapseDuplicateGroups\(raw, windowSize \* 2\)/);
  assert.match(audit, /duplicateWindows:duplicateScan\.rawCount/);
});
