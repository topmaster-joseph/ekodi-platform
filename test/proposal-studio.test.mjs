import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROPOSAL_DOMAINS,PROPOSAL_GOALS,PROPOSAL_STAGES,inferDomain,selectedStages,createProposalDraft,reviewProposalDraft,draftToMarkdown,validImportedDraft} from '../proposal/core.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('domains and goals are general-purpose and unique',()=>{
  assert.equal(PROPOSAL_DOMAINS.length,8);
  assert.equal(new Set(PROPOSAL_DOMAINS.map(item=>item.id)).size,PROPOSAL_DOMAINS.length);
  assert.equal(PROPOSAL_GOALS.length,4);
  assert.equal(PROPOSAL_STAGES.length,16);
});
test('domain inference works without inferring figures or inventing evidence',()=>{
  assert.equal(inferDomain('목포 시민 관광정책 제안'),'public');
  assert.equal(inferDomain('경영학박사 논문 연구'),'education');
  assert.equal(inferDomain('지역 선교와 교회'),'mission');
  assert.equal(inferDomain('지역 협동조합 운영'),'nonprofit');
  assert.equal(inferDomain('코딩 플랫폼 개발'),'technology');
  assert.equal(inferDomain('완전히 새로운 활동'),'general');
});
test('conditional 16-stage workflow does not force unavailable presentation steps',()=>{
  const simple=selectedStages();
  assert.ok(simple.some(item=>item.id===7));
  assert.ok(!simple.some(item=>item.id===2||item.id===3||item.id===15));
  const all=selectedStages({sources:1,form:true,data:true,research:true,presentation:true});
  assert.deepEqual(all.map(item=>item.id),Array.from({length:16},(_,index)=>index+1));
});
test('proposal draft is structured but remains explicitly unverified',()=>{
  const draft=createProposalDraft({title:'지역 상인 대상 AI 교육',idea:'상인에게 실제 교육 지원',domain:'auto',goal:'funding',sourceNames:['근거.pdf']});
  assert.equal(draft.schema,'ekodi.proposal.draft.v1');
  assert.equal(draft.domain,'education');
  assert.equal(draft.goal,'funding');
  assert.ok(draft.sections.every(section=>section.body===''));
  assert.equal(draft.sources[0].verification,'not_verified');
  assert.equal(draft.decisions.totalBudget,'');
  assert.equal(reviewProposalDraft(draft).submissionReady,false);
  assert.match(draftToMarkdown(draft),/제출 전 근거·수치·권한 확인 필요/);
  assert.doesNotMatch(draftToMarkdown(draft),/1인당 관광소비|1,000,000/);
  assert.equal(validImportedDraft(JSON.parse(JSON.stringify(draft))),true);
});
test('project input and import schemas are bounded',()=>{
  assert.throws(()=>createProposalDraft({}),/필요/);
  const draft=createProposalDraft({idea:'공공사업'});
  assert.equal(draft.domain,'public');
  assert.equal(validImportedDraft({...draft,schema:'external.any'}),false);
  assert.equal(validImportedDraft({...draft,sections:[]}),false);
  assert.equal(validImportedDraft({...draft,sections:[{id:'evil',name:'X',body:'x'.repeat(50001)}]}),false);
});
test('public editor is CSP-compatible, read-only at origin, and privacy-labeled',()=>{
  const html=read('proposal/index.html');
  const client=read('proposal/client.js');
  const site=read('site-worker.js');
  const build=read('scripts/build.mjs');
  assert.match(html,/src="\/proposal\/client\.js"/);
  assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html,/서버 저장 없음/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)/i);
  assert.doesNotMatch(client,/\blocalStorage\b|\bsessionStorage\b|\beval\s*\(|\binnerHTML\s*=/);
  assert.doesNotMatch(client,/\bfetch\s*\(/);
  assert.match(client,/createProposalDraft/);
  assert.match(client,/draftToMarkdown/);
  assert.match(site,/url\.pathname === '\/proposal'/);
  assert.match(site,/proposal-browser-draft/);
  assert.match(site,/X-Robots-Tag','noindex, nofollow, noarchive/);
  assert.match(site,/allow:'GET, HEAD'/);
  assert.match(build,/cp\(\`\$\{root\}proposal\`/);
});
