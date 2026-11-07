import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const script='tools/ekodi-device-agent/windows/ekodi-device-agent.ps1';

test('owned DevToolsActivePort read retries only exact Windows sharing violations',async()=>{
  const source=await read(script);
  const begin=source.indexOf('function Read-EkodiOwnedDevToolsPort(');
  const end=source.indexOf('function Invoke-EkodiHeadlessScreenshot(',begin);
  assert.ok(begin>0&&end>begin,'small private reader must be declared before screenshot handler');
  const reader=source.slice(begin,end);
  assert.match(reader,/Get-Content -LiteralPath \$PortFile -Encoding UTF8 -ErrorAction Stop/);
  assert.match(reader,/\$readAttempt -le 8/);
  assert.match(reader,/Start-Sleep -Milliseconds 120/);
  assert.match(reader,/\[System\.IO\.IOException\]/);
  assert.match(reader,/\$exception\.InnerException/);
  assert.match(reader,/\$code -eq 32 -or \$code -eq 33/);
  assert.match(reader,/if \(-not \$sharingViolation\) \{ throw 'cdp_port_file_unreadable' \}/);
  assert.match(reader,/if \(\$readAttempt -eq 8\) \{ throw 'cdp_port_file_locked' \}/);
  assert.match(reader,/\$port -gt 65535/);
  assert.match(reader,/throw 'cdp_port_invalid'/);
  assert.doesNotMatch(reader,/Get-CimInstance|Stop-Process|Remove-Item|UserProfile|chrome\.exe|msedge\.exe|AppData|WebSocket/);
});

test('CDP reader is invoked only on isolated task profile after owner-owned browser startup',async()=>{
  const source=await read(script);
  const begin=source.indexOf('function Invoke-EkodiHeadlessScreenshot(');
  const end=source.indexOf('function ',begin+10);
  const region=source.slice(begin,end<0?undefined:end);
  const portFile=region.indexOf("$portFile = Join-Path $TaskProfile 'DevToolsActivePort'");
  const wait=region.indexOf("if (-not (Test-Path -LiteralPath $portFile)) { throw 'cdp_port_file_missing' }");
  const read=region.indexOf('$port = Read-EkodiOwnedDevToolsPort $portFile');
  assert.ok(portFile>0 && wait>portFile && read>wait);
  assert.match(region,/--user-data-dir=\$TaskProfile/);
  assert.doesNotMatch(region,/\$portLines = @\(Get-Content -LiteralPath \$portFile/);
  const owner=source.slice(source.indexOf('function Find-EkodiOwnedProfileBrowsers('),begin);
  assert.match(owner,/Task-/);
  assert.match(owner,/\^\[a-fA-F0-9\]\{32\}\$/);
});
