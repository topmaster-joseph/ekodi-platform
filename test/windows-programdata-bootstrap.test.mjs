import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');

test('Windows Agent restores missing ProgramData before computing persistent paths',()=>{
  const ifIndex=source.indexOf("if ([string]::IsNullOrWhiteSpace($env:ProgramData)) {");
  const pathIndex=source.indexOf("$Root = Join-Path $env:ProgramData 'EKODI\\DeviceAgent'");
  assert.ok(ifIndex > 0, 'missing-ProgramData guard');
  assert.ok(pathIndex > ifIndex, 'ProgramData fix must precede first Agent persistent path');
  assert.match(source,/\[Environment\]::GetFolderPath\(\[Environment\+SpecialFolder\]::CommonApplicationData\)/);
  assert.match(source,/\[System\.IO\.Path\]::IsPathRooted\(\$env:ProgramData\)/);
  assert.match(source,/EKODI:EKA-298/);
  assert.match(source,/\$AgentVersion = '2\.5\.3'/);
});
