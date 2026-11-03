import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const home=fs.readFileSync(new URL('../my/index.html',import.meta.url),'utf8');
const points=fs.readFileSync(new URL('../my/points/index.html',import.meta.url),'utf8');
test('My EKODI activity tab links to the personal points page',()=>{
  assert.match(home, /data-my-tab-section="activity"[\s\S]*?<a class="secondary" href="\/my\/points\/">내 활동포인트 보기<\/a>/);
  assert.match(points, /id="balanceView" hidden/);
  assert.match(points, /id="loginLink"[^>]*hidden/);
  assert.match(points, /name="robots" content="noindex,nofollow,noarchive"/);
});

test('site points cannot call unlaunched API without a separately enabled capability',()=>{
  const worker=fs.readFileSync(new URL('../my-worker.js',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../my/points/app.js',import.meta.url),'utf8');
  const production=fs.readFileSync(new URL('../wrangler.my.toml',import.meta.url),'utf8');
  const staging=fs.readFileSync(new URL('../wrangler.my.staging.toml',import.meta.url),'utf8');
  assert.match(worker,/pointsEnabled:env\.POINTS_ENABLED==='true'&&dataEnabled/);
  assert.match(app,/config\.pointsEnabled===true/);
  assert.match(app,/if\(!enabled\)\{showMessage\('포인트 조회 서비스 준비 중입니다\.'\);return;\}/);
  assert.match(production,/POINTS_ENABLED = "false"/);
  // Staging points may be enabled only against the development project (#6739).
  assert.match(staging,/POINTS_ENABLED = "false"|SUPABASE_URL = "https:\/\/lxcxwbdwwojjkgybbqii\.supabase\.co"/);
  assert.doesNotMatch(staging,/renzehysxirjilvdxacv/);
});

test('points sign-in returns to exact initiating URL via canonical /auth and sanitizes token handoff',()=>{
  const app=fs.readFileSync(new URL('../my/points/app.js',import.meta.url),'utf8');
  assert.match(app,/new URL\('https:\/\/ekodi\.kr\/auth\/\?site=my'\)/);
  assert.match(app,/authUrl\.searchParams\.set\('return_to',returnTo\.href\)/);
  assert.match(app,/sb\.auth\.verifyOtp\(\{token_hash:token,type\}\)/);
  assert.match(app,/window\.history\.replaceState\(\{\},document\.title,location\.pathname\+location\.search\)/);
  assert.match(app,/try\{await handoff\(\);\}/);
  assert.doesNotMatch(app,/login\.href='\/auth\//);
});

test('member points clears balance on sign out and ignores stale API responses',()=>{
  const app=fs.readFileSync(new URL('../my/points/app.js',import.meta.url),'utf8');
  assert.match(app,/sb\.auth\.onAuthStateChange/);
  assert.match(app,/event==='SIGNED_OUT'/);
  assert.match(app,/clearPrivateView\('로그아웃되었습니다/);
  assert.match(app,/balance\.textContent='0'/);
  assert.match(app,/historyList\.replaceChildren\(\)/);
  assert.match(app,/if\(revision!==viewRevision\)return/);
  assert.match(app,/select\.onchange=/);
});

test('points transactions cannot shadow the native browser History API during auth handoff',()=>{
  const app=fs.readFileSync(new URL('../my/points/app.js',import.meta.url),'utf8');
  assert.match(app,/const historyList=document\.getElementById\('history'\)/);
  assert.match(app,/window\.history\.replaceState\(/);
  assert.doesNotMatch(app,/const history=document/);
});
