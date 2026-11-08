import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../sites/mokpo-presbytery/mission/policy-council-2026/index.html',import.meta.url),'utf8');
const generator=readFileSync(new URL('../scripts/build-mokpo-presbytery-pages.py',import.meta.url),'utf8');
const script=readFileSync(new URL('../sites/mokpo-presbytery/mission/policy-council-2026/app.js',import.meta.url),'utf8');

test('seminar form helper is part of the original policy council page, private by default',()=>{
  for(const s of [page,generator]){
    assert.match(s,/<section id="submission" hidden aria-labelledby="pcSubmissionHeading">/);
    assert.match(s,/id="pcSubmissionTools"/);
    assert.match(s,/id="pcRecipient"/);
    assert.match(s,/id="pcReviewButton" disabled/);
    assert.match(s,/id="pcCsvButton" disabled/);
    assert.match(s,/id="pcEmailButton" disabled/);
    assert.match(s,/목포노회 제출 검토용 \(원본 미확인\)/);
    assert.match(s,/메일을 자동 발송하거나 발송 완료로 기록하지 않습니다/);
  }
});

test('official PCK attachment-2 seven fields are preserved in order without inferred extra columns',()=>{
  const fields=['부서명','부서 직책','성명','교직','교회','연락처','정책협의회 참석'];
  let previous=-1;
  for(const field of fields){
    const match='<th>'+field+'</th>';
    const next=page.indexOf(match,previous+1);
    assert.ok(next>previous,match);
    previous=next;
  }
  assert.ok(script.includes("var fields=['부서명','부서 직책','성명','교직','교회','연락처','정책협의회 참석'];"));
  assert.match(script,/return \[row\.dept,row\.role,row\.personName,row\.clergy,row\.churchName,row\.phone,row\.attend\];/);
  assert.match(script,/^\s*if\(\/\^\[\\s\]\*\[=/m); // Excel CSV formula injection escape
});

test('administrator roster fetched from the guarded RPC, not the public masked roster',()=>{
  assert.match(script,/rpc\/organization_event_roster_admin/);
  assert.match(script,/client\.auth\.getSession\(\)/);
  assert.match(script,/authorization:'Bearer '\+sessionToken/);
  assert.match(script,/if\(!response\.ok\)throw new Error/);
  assert.match(script,/if\(!result\|\|!Array\.isArray\(result\.rows\)\)/);
  assert.match(script,/if\(!sessionToken\)return null/);
  assert.match(script,/area\.hidden=false/);
  assert.doesNotMatch(script,/localStorage\.setItem|sessionStorage\.setItem/);
  assert.doesNotMatch(script,/\.innerHTML\s*=/);
});

test('email only opens an explicit draft and does not leak private roster data through mailto',()=>{
  assert.match(script,/window\.location\.href='mailto:'\+to/);
  assert.match(script,/validEmail\(recipient\.value\.trim\(\)\)/);
  assert.match(script,/reviewed&&exported&&ready\.checked/);
  assert.match(script,/실제 발송은 메일 프로그램에서 완료/);
  assert.doesNotMatch(script,/\bfetch\(['"]\/api\/mail\/send/);
  assert.doesNotMatch(script,/window\.location\.href=[^\n]*row\.phone/);
  assert.doesNotMatch(script,/body\s*\+=\s*.*row\.phone/);
  assert.doesNotMatch(script,/mailto:[^'\n]*phone/);
  assert.match(script,/CSV 내려받기|csvText\(\)/);
  assert.doesNotThrow(()=>new Function(script));
});
