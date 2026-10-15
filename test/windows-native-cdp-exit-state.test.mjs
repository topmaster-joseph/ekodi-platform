import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/device-control-windows.yml',import.meta.url),'utf8');
const start=workflow.indexOf('Run native Background Browser Worker on Windows runner');
const end=workflow.indexOf('Probe EKODI isolated desktop backend without activation',start);
const step=workflow.slice(start,end);

test('Windows browser exit normalization cannot precede strict actual Chromium proof',()=>{
  assert.ok(start>0 && end>start);
  const guards=[
    "Native browser canary did not pass.",
    "Native browser worker did not return ok.",
    "DOM or screenshot evidence missing.",
    "Runtime evidence hashes are invalid.",
    "Browser profile isolation proof failed.",
    "Foreground privacy isolation proof failed.",
    "Initial Windows native browser lane must remain read-only.",
    "Background-only lifecycle proof failed.",
    "Automation cleanup or interactive-login boundary failed."
  ];
  const summary=step.indexOf('Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY');
  const normalize=step.indexOf('$global:LASTEXITCODE = 0');
  assert.ok(summary>0 && normalize>summary);
  for(const guard of guards){
    const at=step.indexOf(guard);
    assert.ok(at>0 && at<summary,guard);
  }
  assert.ok(step.includes('if ($null -ne $LASTEXITCODE -and [int]$LASTEXITCODE -ne 0)'));
  assert.ok(step.includes("reset stale native exit status after complete verified proof"));
  assert.doesNotMatch(step,/\bexit\s+0\b/i);
  assert.doesNotMatch(step,/continue-on-error:\s*true/);
});
