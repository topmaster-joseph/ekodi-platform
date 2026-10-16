import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

function realEnrollmentScript() {
  const admin = readFileSync(new URL('../device-control-admin.js', import.meta.url), 'utf8');
  const begin = admin.indexOf('  function utf16leBase64(value) {');
  const end = admin.indexOf('  function downloadEnrollmentInstaller()', begin);
  assert.ok(begin >= 0 && end > begin, 'real downloaded installer function required');
  const ctx = {
    WINDOWS_AGENT_URL:'https://example.invalid/read-only-agent.ps1',
    API_BASE:'https://ekodi.kr',
    btoa:text=>Buffer.from(text, 'latin1').toString('base64'),
  };
  vm.runInNewContext(admin.slice(begin,end) + "\nthis.installer=buildEnrollmentInstaller('EKD-0123456789ABCDEF0123');", ctx, {timeout:1000});
  const encoded = ctx.installer.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)?.[1];
  assert.ok(encoded, 'downloaded CMD contains actual -EncodedCommand payload');
  return {ps:Buffer.from(encoded,'base64').toString('utf16le'),encoded};
}

test('real one-click installer binds finally to catch without a semicolon command break', ()=>{
  const {ps}=realEnrollmentScript();
  assert.match(ps, /}\s*catch\s*\{/);
  assert.match(ps, /}\s*finally\s*\{/);
  assert.doesNotMatch(ps, /}\s*;\s*finally\b/i, 'PowerShell treats ;finally as an unknown command');
  assert.match(ps, /Remove-Item -LiteralPath \$p -Force -ErrorAction SilentlyContinue/);
  assert.match(ps, /EKB-219/);
  assert.doesNotMatch(ps, /Invoke-Expression|\biex\b/i);
});

test('Windows PowerShell 5.1 AST finds bound finally with temp-file cleanup in the actual encoded command', {skip:process.platform!=='win32'}, ()=>{
  const {encoded}=realEnrollmentScript();
  const validation = [
    "$ErrorActionPreference='Stop'",
    "$source=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('"+encoded+"'))",
    '$tokens=$null',
    '$issues=$null',
    '$ast=[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$issues)',
    "if($issues.Count -gt 0){throw ('PowerShell parse failed: '+($issues|Out-String))}",
    '$tries=@($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.TryStatementAst]}, $true))',
    "if($tries.Count -ne 1){throw ('Expected exactly one try statement, found '+$tries.Count)}",
    "if($null -eq $tries[0].Finally){throw 'Generated finally was detached from try/catch'}",
    "if(-not $tries[0].Finally.Extent.Text.Contains('Remove-Item -LiteralPath $p')){throw 'Temp cleanup is missing from bound finally'}",
    "Write-Output 'EKODI GENERATED LAUNCHER FINALLY VERIFIED'",
  ].join('; ');
  // Native PowerShell parses the generated script but must never execute
  // an enrollment/download or connect to production in a CI test.
  const run = spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',validation],{
    encoding:'utf8',timeout:25000,maxBuffer:1024*1024,windowsHide:true,
  });
  assert.equal(run.error, undefined, String(run.error?.message||''));
  assert.equal(run.status, 0, 'PowerShell AST verification failed: '+run.stdout+' '+run.stderr);
  assert.match(run.stdout,/EKODI GENERATED LAUNCHER FINALLY VERIFIED/);
});
