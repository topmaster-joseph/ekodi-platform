import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const timeline = await readFile(new URL('../system-timeline-admin.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('System Timeline reads GitHub operational history', () => {
  assert.match(timeline, /topmaster-joseph\/ekodi-platform/);
  assert.match(timeline, /commits\?sha=main&per_page=30/);
  assert.match(timeline, /actions\/runs\?branch=main&per_page=60/);
  assert.match(timeline, /pulls\?state=all&sort=updated&direction=desc&per_page=25/);
});

test('System Timeline surfaces the three recovery anchors', () => {
  assert.match(timeline, /Current Version/);
  assert.match(timeline, /Last Known Good/);
  assert.match(timeline, /Last Change/);
  assert.match(timeline, /run\.conclusion === 'success'/);
});

test('System Timeline extends Deployments instead of adding another menu', () => {
  assert.match(build, /system-timeline-admin\.css/);
  assert.match(build, /system-timeline-admin\.js/);
  assert.match(build, /release-control-admin\.css/);
  assert.match(build, /release-control-admin\.js/);
  assert.match(timeline, /querySelector\('#releaseControl'\)/);
});
