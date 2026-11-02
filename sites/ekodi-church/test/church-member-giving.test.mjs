import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('member giving is linked from the church-local My Page',async()=>{
  const [home,giving]=await Promise.all([read('my/index.html'),read('my/giving/index.html')]);
  assert.match(home,/\/ekodichurch\/my\/giving\//);
  assert.match(home,/나의 헌금/);
  assert.match(giving,/data-ekodi-church-giving="v1"/);
  assert.match(giving,/noindex,nofollow,noarchive/);
  assert.match(giving,/로그인한 본인의 연도별 헌금내역만/);
  assert.match(giving,/무기명 헌금과 다른 교인의 내역은 개인 화면에 표시되지 않습니다/);
});

test('member giving client uses authenticated self-service API only',async()=>{
  const app=await read('my/giving/app.js');
  assert.match(app,/functions\/v1\/church-member-giving-api/);
  assert.match(app,/authorization:'Bearer '\+active\.accessToken/);
  assert.match(app,/action:'request_receipt'/);
  assert.match(app,/member_not_linked|교인정보 연결이 필요합니다/);
  assert.doesNotMatch(app,/church_offerings|church_members|church_staff|church_care_tasks/);
  assert.doesNotMatch(app,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test('member giving layout remains responsive as My Page gains another card',async()=>{
  const [homeCss,givingCss]=await Promise.all([read('my/styles.css'),read('my/giving/styles.css')]);
  assert.match(homeCss,/repeat\(auto-fit,minmax\(190px,1fr\)\)/);
  assert.match(givingCss,/@media\(max-width:680px\)/);
  assert.match(givingCss,/\.summary\{grid-template-columns:1fr\}/);
});
