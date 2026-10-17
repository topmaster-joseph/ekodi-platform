import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/verify-seonammedi-calendar-live-native.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-calendar-live-native.yml',import.meta.url),'utf8');

test('real browser probe makes no synthetic fixture or admin/Google auth claims',()=>{
  assert.match(script,/from 'playwright'/);
  assert.match(script,/realPublishedEvent:true,fixtureResponse:false,googleAdminLogin:false/);
  assert.match(script,/actualMobileOsShareSheet:false,productionMutation:false/);
  assert.doesNotMatch(script,/route\.fulfill|E2E_ADMIN_TOKEN|BOARD_CANARY_GOOGLE_TOKEN|sessionStorage\.setItem|localStorage\.setItem/);
  assert.match(script,/['"]GET['"],['"]HEAD['"],['"]OPTIONS['"]/);
  assert.match(script,/route\.abort\('blockedbyclient'\)/);
});
test('actual live event id is discovered from public API, not hardcoded or created in DB',()=>{
  assert.match(script,/fetch\('\/api\/seonammedi\/calendar\?month='/);
  assert.match(script,/rows\.find\(e=>e\?\.kind==='event'/);
  assert.match(script,/no_real_public_event_available/);
  assert.match(script,/const link=board\+'\?schedule='/);
  assert.doesNotMatch(script,/POST|PUT|PATCH|DELETE|\/admin\/notices|route\.fulfill/);
});
test('native proof tests both screen sizes with real link, clipboard and captured Web Share arguments',()=>{
  assert.match(script,/name:'desktop',width:1440,height:900,mobile:false/);
  assert.match(script,/name:'mobile',width:390,height:844,mobile:true/);
  assert.match(script,/page\.goto\(link/);
  assert.match(script,/\.seonam-calendar-event\.is-shared/);
  assert.match(script,/navigator\.clipboard\.readText\(\)/);
  assert.match(script,/__ekodiRealEventShareArgs/);
  assert.match(script,/noHorizontalOverflow/);
  assert.match(script,/await page\.screenshot/);
  assert.doesNotMatch(script,/TinyFish|remoteDesktop|persistentContext/i);
});
test('workflow calls both live hosts, retains screenshots and does not claim Google auth proof',()=>{
  assert.match(workflow,/--origin=https:\/\/seonammedi\.kr/);
  assert.match(workflow,/--origin=https:\/\/ekodi\.kr/);
  assert.match(workflow,/--month=2026-10/);
  assert.match(workflow,/npx playwright install --with-deps chromium/);
  assert.match(workflow,/node --test test\/seonammedi-calendar-live-native\.test\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/No Google administrator sign-in or native mobile OS share-sheet was performed/);
  assert.match(workflow,/permissions:\n  contents: read/);
});
