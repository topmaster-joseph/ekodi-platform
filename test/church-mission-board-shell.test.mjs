import test from 'node:test';
import assert from 'node:assert/strict';
import {page,postPage,boardIdentityShell} from '../site-board-control.js';

const church={siteId:'ekodichurch',basePath:'/ekodichurch/board'};
const mission={siteId:'ekodimission',basePath:'/ekodimission/board'};

test('Church board list uses church header and footer without body excerpts or redirects',async()=>{
  const response=page(church,[{id:9,title:'11월 22일 교회소식',body:'공개 목록에서 숨겨야 할 전체 내용',createdAt:'2026-11-22T00:00:00Z'}],'notice');
  const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-board-independent'),'true');
  assert.match(html,/<header class="site-header"/);
  assert.match(html,/<footer class="site-footer church-footer" data-ekodi-service-footer>/);
  assert.match(html,/에코디교회 정찬균/);
  assert.match(html,/href="\/ekodichurch\/notices\/"/);
  assert.match(html,/11월 22일 교회소식/);
  assert.doesNotMatch(html,/공개 목록에서 숨겨야 할 전체 내용/);
  assert.doesNotMatch(html,/사업자 소재지|운영주체|location\.replace/);
  assert.match(html,/\/ekodichurch\/church-shell\.js/);
});

test('Church schedule category hides JSON excerpt and links retain tenant',async()=>{
  const response=page(church,[{id:10,title:'주일예배',body:JSON.stringify({date:'2026-11-22',time:'11:00',venue:'에코디교회'}),createdAt:'2026-11-22T00:00:00Z'}],'schedule');
  const html=await response.text();
  assert.match(html,/href="\/ekodichurch\/board\/post\/10"/);
  assert.doesNotMatch(html,/\\\"date\\\"|&quot;date&quot;|\{&quot;date/);
  assert.match(html,/주요일정/);
});

test('Mission board uses its own shell and never inherits church identity',async()=>{
  const response=page(mission,[{id:11,title:'선교회 토요모임',body:'일정 상세',createdAt:'2026-11-28T00:00:00Z'}],'mission-schedule');
  const html=await response.text();
  assert.match(html,/<header class="mission-site-header"/);
  assert.match(html,/<footer class="site-footer" data-ekodi-service-footer>/);
  assert.match(html,/에코디선교회/);
  assert.match(html,/\/ekodimission\/assets\/shell\.js/);
  assert.doesNotMatch(html,/church-footer-brand/);
});

test('Board post detail preserves same shell and other tenant boards remain unchanged',async()=>{
  const response=postPage(church,{id:1,title:'교회공지',body:'본문',comments:[]});
  const html=await response.text();
  assert.match(html,/<header class="site-header"/);
  assert.match(html,/교회공지/);
  const plain=boardIdentityShell({siteId:'cgma'},'<html><body><main>original</main></body></html>');
  assert.equal(plain,'<html><body><main>original</main></body></html>');
});
