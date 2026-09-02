import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Education is one active platform with Admission and Study areas',async()=>{
  const service=EKODI_SERVICE_MANIFEST.services.find(row=>row.id==='edu');
  assert.ok(service);
  assert.notEqual(service.state,'planned');
  assert.equal(service.url,'https://edu.ekodi.kr/');
  assert.equal(service.shellIntegration,'worker-injected');
  assert.equal(service.authMode,'client');
  assert.equal(service.openSso,true);
  assert.ok(service.capabilities.includes('admission'));
  assert.ok(service.capabilities.includes('study'));
  const [home,admission,study]=await Promise.all([read('education/index.html'),read('education/admission/index.html'),read('education/study/index.html')]);
  assert.match(home,/TWO AREAS · ONE EDUCATION CONTEXT/);
  assert.match(admission,/ADMISSION · SOURCE FIRST/);
  assert.match(study,/STUDY · CONTINUITY/);
});

test('Education first release protects high-impact actions and sensitive documents',async()=>{
  const [home,admission,worker]=await Promise.all([read('education/index.html'),read('education/admission/index.html'),read('education-worker.js')]);
  assert.match(home,/민감한 여권·성적표·재정증빙 파일을 저장하지 않습니다/);
  assert.match(admission,/원서 자동제출 없음/);
  assert.match(admission,/근거 없는 합격확률 없음/);
  assert.match(worker,/submissionExecution:false/);
  assert.match(worker,/sensitiveDocumentStorage:false/);
  assert.match(worker,/officialSourceRequired:true/);
});

test('Education is an isolated Worker with Shell and admin handoff',async()=>{
  const [worker,boundaries,production,staging]=await Promise.all([read('education-worker.js'),read('platform-boundaries.json'),read('wrangler.education.toml'),read('wrangler.education.staging.toml')]);
  assert.match(worker,/injectEkodiShell/);
  assert.match(worker,/Response\.redirect\('https:\/\/admin\.ekodi\.kr\/',307\)/);
  assert.match(boundaries,/"education"/);
  assert.match(boundaries,/education_\*/);
  assert.match(production,/pattern = "edu\.ekodi\.kr"/);
  assert.match(production,/DATA_MODE = "production"/);
  assert.match(staging,/DATA_ENABLED = "false"/);
  assert.match(staging,/DATA_MODE = "isolated-staging"/);
});

test('Admin Campus observes Education as live, not planned',async()=>{
  const campus=await read('campus-actions.js');
  assert.match(campus,/name: '에코디교육', domain: 'edu\.ekodi\.kr'/);
  assert.doesNotMatch(campus,/domain: 'edu\.ekodi\.kr'[^\n]*lifecycle: 'planned'/);
});

test('Education browser code stores planning metadata only and parses',async()=>{
  const app=await read('education/app.js');
  assert.match(app,/ekodi_education_planner_v1/);
  assert.doesNotMatch(app,/passport|성적표|재정증빙|resident|주민등록/i);
  assert.match(app,/isHttps/);
  execFileSync(process.execPath,['--check',fileURLToPath(new URL('../education/app.js', import.meta.url))],{stdio:'pipe'});
  execFileSync(process.execPath,['--check',fileURLToPath(new URL('../education-worker.js', import.meta.url))],{stdio:'pipe'});
});

test('Post-promotion Education code does not retain unused rollout hooks',async()=>{
  const [app,worker,production]=await Promise.all([read('education/app.js'),read('education-worker.js'),read('wrangler.education.toml')]);
  assert.doesNotMatch(app,/data-auth-link|bindJourneyLinks/);
  assert.doesNotMatch(worker,/journeyUrl/);
  assert.doesNotMatch(production,/release workflow reconciles this custom-domain trigger/i);
});
