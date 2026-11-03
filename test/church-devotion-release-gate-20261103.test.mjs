import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-ekodi-church-homepage.yml', import.meta.url), 'utf8');

test('Church deployment stays within official orchestrator release authority', () => {
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /release_branch_ref:/);
  assert.match(workflow, /release_task_id:/);
  assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs/);
  assert.match(workflow, /--release/);
  assert.match(workflow, /topmaster-joseph\/ekodi-church/);
});

test('deployment requires canonical daily devotion and refuses retired journal controls', () => {
  assert.ok(workflow.includes("grep -Fq '<h1>에코디 오늘의 매일묵상</h1>' church/devotion/index.html"));
  assert.ok(workflow.includes("grep -Fq '<h1>에코디 오늘의 매일묵상</h1>' /tmp/church-devotion.html"));
  assert.ok(workflow.includes("grep -Fq 'href=\"/ekodichurch/devotion/\"' church/index.html"));
  assert.ok(workflow.includes("grep -Fq '<strong>매일묵상</strong>' /tmp/church.html"));
  for (const retired of ['data-ekodi-life-hub', 'life-reflection-form', 'memory-form', 'witness-form', 'church-life-hub\\.(css|js)']) {
    assert.ok(workflow.includes(retired), 'the release must explicitly reject ' + retired);
  }
  assert.doesNotMatch(workflow, /grep -Fq 'data-ekodi-life-hub' church\/index\.html/);
  assert.doesNotMatch(workflow, /grep -Fq 'PRIVATE FIRST' church\/index\.html/);
  assert.doesNotMatch(workflow, /grep -Fq 'church-life-hub\.js' church\/index\.html/);
  assert.doesNotMatch(workflow, /grep -Fq '<h1>오늘의 매일묵상<\/h1>'/);
});

test('real browser deployment verification covers supported languages and five device widths', () => {
  for (const width of [320, 390, 768, 1366, 1440]) {
    assert.ok(workflow.includes('width:' + width + ','), 'missing device width ' + width);
  }
  assert.match(workflow, /const locales=\['ko-KR','en','zh-CN','ja','my','kac','vi','mn','id'\]/);
  assert.match(workflow, /initial\.legacyLifeRecord,false/);
  assert.match(workflow, /initial\.canonicalDevotion,true/);
  assert.match(workflow, /initial\.overflow,false/);
  assert.match(workflow, /mobileGreetingGap>=0&&initial\.mobileGreetingGap<100/);
  assert.match(workflow, /assert\.deepEqual\(failures,\[\]/);
});
