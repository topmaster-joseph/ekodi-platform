import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Windows CDP port file lock is retried without bypassing isolation or indefinite waits',()=>{
  const agent=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
  const start=agent.indexOf('function Invoke-EkodiHeadlessScreenshot');
  const end=agent.indexOf('function ',start+10);
  assert.ok(start>=0 && end>start);
  const routine=agent.slice(start,end);
  assert.match(routine,/\$portReadDeadline = \[DateTime\]::UtcNow.AddSeconds\(5\)/);
  assert.match(routine,/Get-Content -LiteralPath \$portFile -Encoding UTF8 -ErrorAction Stop/);
  assert.match(routine,/catch \[System\.IO\.IOException\]/);
  assert.match(routine,/catch \[System\.UnauthorizedAccessException\]/);
  assert.match(routine,/Start-Sleep -Milliseconds 100/);
  assert.match(routine,/cdp_port_invalid_or_locked/);
  assert.match(routine,/\$candidatePort -le 65535/);
  assert.match(routine,/--user-data-dir=\$TaskProfile/);
});
