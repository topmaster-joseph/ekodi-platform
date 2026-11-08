// EKODI-SITE-CHECK-001 — 로컬 PC 사이트 점검은 백그라운드가 기본, 보이는 창은 자동 종료.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const tool = await readFile(join(repo, 'tools/ekodi-device-agent/windows/ekodi-site-check.ps1'), 'utf8');
const agents = await readFile(join(repo, 'AGENTS.md'), 'utf8');

test('site check defaults to headless with an EKODI-owned temporary profile', () => {
  assert.match(tool, /--headless=new/);
  assert.match(tool, /CreateNoWindow = \$true/);
  assert.match(tool, /--user-data-dir/);
  assert.match(tool, /\[switch\]\$Visible/);
  // 기본 모드에서는 Start-Process(보이는 창)를 쓰지 않는다: Start-Process는 Visible 함수 안에만 존재
  const headless = tool.slice(tool.indexOf('function Invoke-HeadlessCheck'), tool.indexOf('function Invoke-VisibleCheck'));
  assert.doesNotMatch(headless, /Start-Process/);
});

test('visible mode always auto-closes and cleans up in finally', () => {
  assert.match(tool, /\[ValidateRange\(5, 600\)\]\[int\]\$AutoCloseSeconds = 60/);
  const visible = tool.slice(tool.indexOf('function Invoke-VisibleCheck'), tool.indexOf('$browser = Resolve-EkodiCheckBrowser'));
  assert.match(visible, /finally\s*\{[\s\S]*Stop-OwnedBrowserTree[\s\S]*Remove-OwnedProfile/);
});

test('never targets the user browser or its profile', () => {
  const resolver = tool.slice(tool.indexOf('function Resolve-EkodiCheckBrowser'), tool.indexOf('function Assert-SafeHttpUrl'));
  assert.doesNotMatch(resolver, /opera\.exe|launcher\.exe/i);
  // 정리 대상은 EKODI 임시 프로필 경로가 명령줄에 있는 프로세스로 한정
  assert.match(tool, /\[string\]\$_\.CommandLine -match \$escaped/);
  assert.doesNotMatch(tool, /Stop-Process -Name/);
  assert.match(tool, /userBrowserTouched = \$false/);
});

test('AGENTS.md carries the background-only site check rule', () => {
  assert.match(agents, /EKODI-SITE-CHECK-001/);
  assert.match(agents, /ekodi-site-check\.ps1/);
});

// 로컬 자동화 스크립트가 사용자 기본 브라우저로 URL을 여는 회귀를 막는다.
const DEFAULT_BROWSER_OPEN = [
  /Start-Process\s+(-FilePath\s+)?['"]?https?:\/\//i,
  /\bcmd(\.exe)?\s+\/c\s+start\s+("")?\s*['"]?https?:\/\//i,
  /^\s*start\s+("")?\s*['"]?https?:\/\//im,
  /explorer(\.exe)?\s+['"]?https?:\/\//i,
  /rundll32(\.exe)?\s+url\.dll/i,
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ps1|cmd|bat|vbs)$/i.test(entry.name)) yield full;
  }
}

test('no local automation script opens URLs in the user default browser', async () => {
  const offenders = [];
  for await (const file of walk(join(repo, 'tools'))) {
    const text = await readFile(file, 'utf8');
    for (const pattern of DEFAULT_BROWSER_OPEN) {
      if (pattern.test(text)) offenders.push(`${relative(repo, file)} :: ${pattern}`);
    }
  }
  for await (const file of walk(join(repo, 'agents'))) {
    const text = await readFile(file, 'utf8');
    for (const pattern of DEFAULT_BROWSER_OPEN) {
      if (pattern.test(text)) offenders.push(`${relative(repo, file)} :: ${pattern}`);
    }
  }
  assert.deepEqual(offenders, []);
});
