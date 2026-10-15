import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_PORTRAIT} from '../education/study/ai-bootcamp/documents/portrait.js';
import {DEFAULT_RESUME,DEFAULT_SYLLABUS,escapeHtml,validEmail,documentBody,documentHtml,makeEmailDraft} from '../education/study/ai-bootcamp/documents/documents.js';

const root=new URL('../education/study/ai-bootcamp/documents/',import.meta.url);
const file=name=>readFileSync(new URL(name,root),'utf8');
test('Drive portrait is a valid inlined JPG, no additional identity documents',()=>{
  assert.match(DEFAULT_PORTRAIT,/^data:image\/jpeg;base64,/);
  const photo=Buffer.from(DEFAULT_PORTRAIT.slice(DEFAULT_PORTRAIT.indexOf(',')+1),'base64');
  assert.ok(photo.length>5000&&photo.length<150000);
  assert.equal(photo[0],0xff);assert.equal(photo[1],0xd8);
  assert.doesNotMatch(file('index.html'),/신분증|여권번호|주민등록번호/);
});
test('editable resume and syllabus use factual proposal state',()=>{
  assert.match(DEFAULT_RESUME.name,/정찬균/);
  assert.match(DEFAULT_RESUME.education,/확인 후 수정/);
  assert.match(DEFAULT_SYLLABUS.schedule,/24회 · 48시간/);
  assert.match(DEFAULT_SYLLABUS.security,/개인정보/);
  assert.match(file('index.html'),/id="portraitEditor"/);
  assert.match(file('index.html'),/id="makeEml"/);
  assert.match(file('index.html'),/id="printDoc"/);
});
test('document strings escape user provided markup',()=>{
  assert.equal(escapeHtml('<script>&"'), '&lt;script&gt;&amp;&quot;');
  const body=documentBody('resume',{...DEFAULT_RESUME,name:'<img src=x onerror=1>'},DEFAULT_PORTRAIT);
  assert.doesNotMatch(body,/<img src=x onerror=1>/);
  assert.match(body,/&lt;img src=x onerror=1&gt;/);
  assert.match(documentHtml('syllabus',DEFAULT_SYLLABUS,DEFAULT_PORTRAIT),/AI 교육 강의계획서/);
});
test('recipient must be a single email address without header injection',()=>{
  assert.equal(validEmail('hello@example.org'),true);
  for(const e of ['','abc','x@example.org\nBcc:evil@example.org','one@example.org,two@example.org','a@b..com'])assert.equal(validEmail(e),false,e);
});
test('EML creates reviewable email and includes photo as MIME attachment',()=>{
  const draft=makeEmailDraft({kind:'resume',model:DEFAULT_RESUME,portrait:DEFAULT_PORTRAIT,to:'demo@example.org',subject:'강사 이력서 제출',message:'강사 제출 자료입니다.'});
  assert.match(draft,/^To: demo@example.org\r\n/);
  assert.match(draft,/Subject: =\?UTF-8\?B\?/);
  assert.match(draft,/Content-Type: multipart\/mixed/);
  assert.match(draft,/Content-Disposition: attachment; filename="EKODI_Instructor_Resume.html"/);
  assert.match(draft,/Content-ID: <ekodi-instructor-photo>/);
  assert.match(draft,/--EKODI_DOCUMENT_[a-z0-9]+--/);
  const syllabus=makeEmailDraft({kind:'syllabus',model:DEFAULT_SYLLABUS,portrait:DEFAULT_PORTRAIT,to:'demo@example.org',subject:'강의계획서 제출'});
  assert.doesNotMatch(syllabus,/Content-ID: <ekodi-instructor-photo>/);
  assert.throws(()=>makeEmailDraft({kind:'resume',model:DEFAULT_RESUME,portrait:DEFAULT_PORTRAIT,to:'a@example.org\r\nBcc:evil@example.org',subject:'safe'}));
});
test('CSP-compatible assets and user-confirmed emailing only',()=>{
  const html=file('index.html');const script=file('documents.js');
  assert.match(html,/type="module" src="\.\/documents\.js"/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)/i);
  assert.doesNotMatch(script,/\bfetch\s*\(|localStorage\.|sessionStorage\./);
  assert.match(script,/location\.href=url/);
  assert.match(script,/if\(\$\('makeEml'\)\.disabled\)return/);
});