#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const run = spawnSync(process.execPath, ['scripts/github-actions-inventory.mjs'], {encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
const report = JSON.parse(run.stdout);
assert.equal(report.schema_version,1);
assert.ok(report.total > 0,'expected workflow definitions');
assert.equal(report.total,report.items.length);
assert.ok(report.scheduled <= report.total);
assert.ok(report.items.every(item => typeof item.file === 'string' && Array.isArray(item.crons)));
console.log('GitHub Actions inventory smoke test passed:', report.total, 'definitions');
