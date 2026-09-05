import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My EKODI exposes a private personal finance control surface',async()=>{
  const [html,worker,app]=await Promise.all([read('my/index.html'),read('my-worker.js'),read('my/personal-finance.js')]);
  assert.match(html,/id="money"/);
  assert.match(html,/personal-finance\.js/);
  assert.match(html,/personal-finance\.css/);
  assert.match(worker,/https:\/\/personal-finance-api\.ekodi\.kr/);
  assert.match(worker,/personalFinanceControl:true/);
  assert.match(app,/EKODI_MY_AUTH\?\.getAccessToken/);
  assert.match(app,/\/import\/preview/);
  assert.match(app,/\/import\/commit/);
  assert.match(app,/xlsx@0\.18\.5/);
  assert.doesNotMatch(app,/service_role|SUPABASE_SERVICE/i);
  const syntax=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../my/personal-finance.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
});
test('public Money does not present demo balances as operational data',async()=>{
  const [html,app]=await Promise.all([read('money/index.html'),read('money/app.js')]);
  assert.match(html,/https:\/\/my\.ekodi\.kr\/#money/);
  assert.match(app,/const demoAccounts = \[\];/);
  assert.match(app,/실데이터 미연결/);
  assert.match(app,/공개 Money 화면에는 개인 잔액이나 예시 숫자를 표시하지 않습니다/);
  assert.doesNotMatch(app,/1324000|67300|120120|국민은행|예전 급여계좌/);
});
