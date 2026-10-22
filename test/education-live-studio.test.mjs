import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {COURSE} from '../education/study/live/courses/mnu-factchat-2026.js';
import {NOTES} from '../education/study/live/courses/mnu-factchat-2026.notes.js';
import {COURSES} from '../education/study/live/courses/registry.js';
import {COURSE as BOOTCAMP} from '../education/study/ai-bootcamp/catalog.js';
import {validateCourse,practiceMinutes,totalMinutes,practiceModules,sessionSlides,buildPrompts,missionMaterials,learnerUrl,parseLearnerParams,liveBase,courseMarkdown,formatClock} from '../education/study/live/engine/model.js';
import {initialState,reduce,timerRemainingMs,lectureElapsedMs,timerPhase,sanitizeState,createLiveStore} from '../education/study/live/engine/live-state.js';
import {encodeQr,qrSvg} from '../education/study/live/engine/qr.js';
import {FACTCHAT_TOOL,FACTCHAT_FEATURES} from '../education/study/live/tools/factchat.js';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('FactChat camp is 2 sessions × 120 minutes with exactly 120 minutes of individual practice (4 × 30)',()=>{
  assert.equal(validateCourse(COURSE),true);
  assert.equal(COURSE.sessions.length,2);
  assert.ok(COURSE.sessions.every(s=>s.minutes===120));
  assert.equal(totalMinutes(COURSE),240);
  assert.equal(practiceMinutes(COURSE),120);
  assert.deepEqual(practiceModules(COURSE).map(m=>[m.session,m.missionId,m.start,m.end]),[[1,'hwp',40,70],[1,'minutes',80,110],[2,'ppt',25,55],[2,'free',65,95]]);
  const s1=COURSE.sessions[0].modules.map(m=>[m.start,m.end]);
  assert.deepEqual(s1,[[0,10],[10,25],[25,40],[40,70],[70,80],[80,110],[110,120]]);
  const s2=COURSE.sessions[1].modules.map(m=>[m.start,m.end]);
  assert.deepEqual(s2,[[0,15],[15,25],[25,55],[55,65],[65,95],[95,110],[110,120]]);
  assert.equal(COURSE.sessions[1].modules.at(-1).kind,'share');
});

test('existing 4회차 × 6세트 bootcamp is preserved as a separate course and not overwritten',()=>{
  assert.equal(BOOTCAMP.id,'mnu-staff-ai-2026');
  assert.equal(BOOTCAMP.lessons.length*BOOTCAMP.batches.length,24);
  assert.notEqual(COURSE.id,BOOTCAMP.id);
  const listed=COURSES.find(c=>c.id===BOOTCAMP.id);
  assert.equal(listed.engine,'classroom');
  assert.equal(listed.href,'study/ai-bootcamp/');
});

test('mission engine: 10-part structure, 7 job tracks × 3 roles, 5 levels, no unresolved template text',()=>{
  assert.deepEqual(COURSE.tracks.map(t=>t.label),['기획·평가','학사·교무','학생지원·취업','연구·산학협력','총무·회계','홍보·국제교류','시설·도서관·기타 행정']);
  assert.deepEqual(COURSE.levels.map(l=>l.id),['starter','basic','intermediate','advanced','expert']);
  assert.deepEqual(COURSE.levels.map(l=>l.label),['입문','초급','중급','고급','심화']);
  assert.ok(COURSE.tracks.every(t=>t.roles.length===3&&t.roles.every(r=>r.id&&r.label)));
  const rp=buildPrompts(COURSE,'hwp','academic','basic','curriculum')[0].text;
  assert.match(rp,/^\[내 업무\] 학사·교무 · 수업·교과과정 담당/);
  assert.match(buildPrompts(COURSE,'hwp','academic','expert')[0].text,/재사용 프롬프트 템플릿/);
  assert.match(buildPrompts(COURSE,'hwp','academic','expert')[0].text,/일치 여부/,'심화 keeps the 고급 addendum');
  for(const [id,m] of Object.entries(COURSE.missions)){
    for(const k of ['problem','why','features','prepare','steps','prompts','expected','errors','deliverable','apply'])assert.ok(m[k]&&(m[k].length??1),id+' '+k);
    assert.ok(m.fallback.steps.length>=3,id+' fallback');
    for(const t of COURSE.tracks)for(const l of COURSE.levels){
      const prompts=buildPrompts(COURSE,id,t.id,l.id);
      assert.ok(prompts.length>=2);
      for(const p of prompts)assert.doesNotMatch(p.text,/undefined|\[object Object\]|NaN/);
      if(l.id!=='basic')assert.ok(prompts[0].text.includes('추가 조건'));
    }
  }
  assert.match(buildPrompts(COURSE,'hwp','research','basic')[0].text,/신진연구자/);
  assert.match(buildPrompts(COURSE,'minutes','facility','basic')[0].text,/보류/);
});

test('materials are fictional, labelled, ASCII-named and contain no personal identifiers',()=>{
  const blob=JSON.stringify(COURSE.trackMaterials)+JSON.stringify(COURSE.errorHunts);
  assert.doesNotMatch(blob,/\d{6}-\d{7}|01[016789]-?\d{3,4}-?\d{4}|@[a-z0-9-]+\.(com|kr|ac\.kr)/i);
  for(const m of ['hwp','minutes','ppt'])for(const t of COURSE.tracks){
    const files=missionMaterials(COURSE,m,t.id);
    assert.ok(files.length>=1);
    for(const f of files){assert.match(f.name,/^[\x20-\x7e]+$/);assert.match(f.text,/가상|허구/);}
  }
});

test('slides cover every module, practice has QR join slides, notes exist for every module',()=>{
  for(const s of COURSE.sessions){
    const slides=sessionSlides(COURSE,s.no);
    for(const m of s.modules)assert.ok(slides.some(x=>x.moduleId===m.id),m.id);
    assert.ok(slides.filter(x=>x.special==='join').length>=2);
    for(const m of s.modules)assert.ok(NOTES[m.id],'notes '+m.id);
  }
  const md=courseMarkdown(COURSE,{notes:NOTES});
  assert.match(md,/강사 노트/);
  assert.doesNotMatch(courseMarkdown(COURSE),/강사 노트/);
});

test('learner join link carries only non-personal pointers and round-trips',()=>{
  const e=1800000000000;
  const url=learnerUrl('https://ekodi.kr','/edu/study/live/',{c:COURSE.id,s:2,m:'ppt',lv:'advanced',e});
  assert.equal(url,'https://ekodi.kr/edu/study/live/lab/?c=mnu-factchat-2026&s=2&m=ppt&lv=advanced&e=1800000000000&open=1');
  assert.equal(learnerUrl('http://127.0.0.1:8765','/study/live/present/',{c:COURSE.id}),'http://127.0.0.1:8765/study/live/lab/?c=mnu-factchat-2026');
  assert.equal(liveBase('/edu/factchat/'),'/edu');
  assert.deepEqual(parseLearnerParams(new URL(url).search,COURSE),{open:true,c:COURSE.id,s:2,m:'ppt',lv:'advanced',e});
  const bad=parseLearnerParams('?s=9&m=<script>&lv=root&e=-5',COURSE);
  assert.deepEqual([bad.s,bad.m,bad.lv,bad.e],[1,'','',0]);
});

test('live state: timers survive refresh via absolute timestamps; pause/resume/add/reset',()=>{
  let s=initialState(COURSE.id);const t0=1_000_000;
  s=reduce(s,{type:'lecture/start'},t0);
  s=reduce(s,{type:'timer/start',missionId:'hwp',durationMs:30*60000},t0);
  assert.equal(timerRemainingMs(s,t0+60000),29*60000);
  assert.equal(timerPhase(s,t0+26*60000),'warn');
  assert.equal(timerPhase(s,t0+29.5*60000),'final');
  assert.equal(timerPhase(s,t0+31*60000),'done');
  const restored=sanitizeState(JSON.parse(JSON.stringify(s)),COURSE.id);
  assert.equal(timerRemainingMs(restored,t0+10*60000),20*60000);
  s=reduce(s,{type:'timer/pause'},t0+10*60000);
  assert.equal(timerRemainingMs(s,t0+50*60000),20*60000);
  s=reduce(s,{type:'timer/resume'},t0+50*60000);
  s=reduce(s,{type:'timer/add',ms:60000},t0+50*60000);
  assert.equal(timerRemainingMs(s,t0+50*60000),21*60000);
  s=reduce(s,{type:'lecture/pause'},t0+60*60000);
  assert.equal(lectureElapsedMs(s,t0+90*60000),60*60000);
  s=reduce(s,{type:'timer/reset'},t0);assert.equal(s.timer.status,'idle');
  assert.equal(reduce(s,{type:'nope'},t0),s);
  assert.equal(sanitizeState({v:1,courseId:'other'},COURSE.id).courseId,COURSE.id);
  assert.equal(formatClock(61000),'01:01');
});

test('live store syncs windows through a channel and survives storage failure',()=>{
  const listeners=[];const bus={postMessage:d=>listeners.forEach(l=>l({data:JSON.parse(JSON.stringify(d))})),addEventListener:(_,l)=>listeners.push(l)};
  const mem=new Map();const storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
  let now=5000;const seen=[];
  const a=createLiveStore({courseId:COURSE.id,storage,channel:bus,now:()=>now});
  const b=createLiveStore({courseId:COURSE.id,storage,channel:bus,now:()=>now,onChange:s=>seen.push(s.slideIndex)});
  a.dispatch({type:'slide/set',index:4});
  assert.equal(b.state.slideIndex,4);assert.deepEqual(seen,[4]);
  const c=createLiveStore({courseId:COURSE.id,storage,channel:null,now:()=>now});
  assert.equal(c.state.slideIndex,4,'third window restores from storage');
  const broken={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')},removeItem(){}};
  const d=createLiveStore({courseId:COURSE.id,storage:broken,channel:null,now:()=>now});
  d.dispatch({type:'lecture/start'});assert.equal(d.state.lecture.status,'running');assert.equal(d.persisted,false);
});

test('QR encoder emits valid structure for join links (decode verified separately with jsQR)',()=>{
  const url=learnerUrl('https://ekodi.kr','/edu/study/live/',{c:COURSE.id,s:1,m:'minutes',lv:'intermediate',e:1800000000000});
  const q=encodeQr(url);
  assert.equal(q.size,q.version*4+17);
  for(const [x,y] of [[0,0],[q.size-7,0],[0,q.size-7]]){assert.equal(q.modules[y][x],true);assert.equal(q.modules[y+1][x+1],false);assert.equal(q.modules[y+2][x+2],true);}
  for(let i=8;i<q.size-8;i++)assert.equal(q.modules[6][i],i%2===0);
  assert.equal(q.modules[q.size-8][8],true);
  assert.match(qrSvg('x'),/^<svg[^>]+viewBox="0 0 29 29"/);
  assert.throws(()=>encodeQr('x'.repeat(2000)));
});

test('FactChat integration is link-out only: no SSO, API, cookies or credential fields',async()=>{
  assert.equal(FACTCHAT_TOOL.entryUrl,'https://mokpo.factchat.bot/dashboard/chat/40882');
  assert.equal(FACTCHAT_TOOL.sso,false);assert.equal(FACTCHAT_TOOL.api,false);
  for(const f of FACTCHAT_FEATURES){assert.match(f.docUrl,/^https:\/\/docs\.mindlogic\.ai\//);assert.ok(f.docAsOf);}
  const files=['index.html','instructor.js','present/index.html','present.js','lab/index.html','lab.js','engine/render.js','engine/model.js','engine/live-state.js','tools/factchat.js'];
  for(const f of files){
    const src=await read('education/study/live/'+f);
    assert.doesNotMatch(src,/document\.cookie|type="password"|fetch\(|XMLHttpRequest|sendBeacon|innerHTML\s*=\s*[^;]*location/,f);
  }
});

test('Learner Lab never imports instructor notes; pages are CSP-compatible (no inline script/style/handlers)',async()=>{
  const lab=await read('education/study/live/lab.js');
  assert.doesNotMatch(lab,/loadNotes|\.notes\.js|NOTES/);
  const dir=new URL('../education/study/live/',import.meta.url);
  const pages=['index.html','present/index.html','lab/index.html'].map(p=>read('education/study/live/'+p));
  pages.push(read('education/factchat/index.html'));
  for(const html of await Promise.all(pages)){
    assert.doesNotMatch(html,/<script(?![^>]*\ssrc=)[^>]*>/);
    assert.doesNotMatch(html,/<style[\s>]|\sstyle=|\son[a-z]+=/i);
    assert.match(html,/lang="ko"/);assert.match(html,/name="viewport"/);
  }
  const js=(await readdir(dir,{recursive:true})).filter(f=>f.endsWith('.js'));
  for(const f of js){const src=await read('education/study/live/'+f);assert.doesNotMatch(src,/\sstyle=["']|\son(click|load|error)=/,f);}
});

test('Study hub links the new studio and the existing bootcamp; deploy pipeline verifies it natively',async()=>{
  const [study,deploy,ci]=await Promise.all([read('education/study/index.html'),read('.github/workflows/deploy-education.yml'),read('.github/workflows/ci.yml')]);
  assert.match(study,/href="\/study\/live\/\?c=mnu-factchat-2026"/);
  assert.match(study,/href="\/study\/ai-bootcamp\/"/);
  assert.match(deploy,/node --test test\/education-live-studio\.test\.mjs/);
  assert.match(deploy,/node scripts\/verify-education-live-studio-native\.mjs/);
  assert.match(ci,/test\/education-live-studio\.test\.mjs/);
});

test('result checker flags the course error types and stays quiet on faithful output',async()=>{
  const {checkOutput,extractFacts}=await import('../education/study/live/engine/checker.js');
  const T=COURSE.trackMaterials,M=COURSE.missions;
  const hwp=checkOutput(T.hwp.academic.source,M.hwp.fallback.sampleOutput);
  assert.ok(hwp.findings.some(f=>f.type==='invented-number'&&f.detail.includes('9월 7일')));
  assert.ok(hwp.findings.some(f=>f.type==='invented-contact'&&f.detail.includes('061-000-1234')));
  assert.ok(hwp.findings.some(f=>f.type==='marker'));
  const minutes=checkOutput(T.minutes.facility.script,M.minutes.fallback.sampleOutput);
  assert.ok(minutes.findings.some(f=>f.type==='decided'));
  const ppt=checkOutput(T.ppt.student.facts,M.ppt.fallback.sampleOutput);
  const invented=ppt.findings.find(f=>f.type==='invented-number');
  assert.ok(invented&&/92%/.test(invented.detail)&&/4\.8점/.test(invented.detail)&&/15%/.test(invented.detail));
  const good=checkOutput(T.ppt.student.facts,'신청 42명, 참여 36명, 수료 31명, 만족도 4.4점. 분반 운영은 개선안이며 [확인 필요].');
  assert.equal(good.summary.risk,0);assert.equal(good.summary.warn,0);
  assert.equal(checkOutput('x','').findings[0].type,'empty');
  assert.deepEqual(extractFacts('9월 2일(월) 10:00, 3,000만 원').numbers,['3000만원']);
});

test('every live surface uses self-hosted Pretendard and one owned sticky header outside main',async()=>{
  const pages=['education/study/live/index.html','education/study/live/present/index.html','education/study/live/lab/index.html','education/factchat/index.html'];
  for(const p of pages){
    const html=await read(p);
    assert.match(html,/fonts\/pretendard\/pretendardvariable-dynamic-subset\.css/,p);
    assert.match(html,/<header class="lv-top"[^>]*data-ekodi-fixed-header/,p);
    const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'));
    assert.doesNotMatch(main,/<header[\s>]/,p+' must not put a <header> inside <main> (Shell would adopt it)');
  }
  const css=await read('education/fonts/pretendard/pretendardvariable-dynamic-subset.css');
  assert.match(css,/font-family: 'Pretendard Variable'/);
  assert.match(await read('education/fonts/pretendard/OFL-1.1.txt'),/SIL OPEN FONT LICENSE/i);
  const live=await read('education/study/live/live.css');
  assert.match(live,/--font:"Pretendard Variable"/);
  assert.match(live,/top:var\(--lv-top-h\)/);
  assert.match(live,/var\(--lv-dock-h\)/);
  assert.match(live,/\.lv \[hidden\]\{display:none!important\}/);
  assert.match(await read('education/study/live/present.js'),/ekodiUserHeader='immersive'/);
});

test('canonical /edu router leaves every live-studio script and page byte-identical (no root-slash literals)',async()=>{
  const {routeCanonicalSurface}=await import('../canonical-surface-router.js');
  const {readdir}=await import('node:fs/promises');
  const files=(await readdir(new URL('../education/study/live/',import.meta.url),{recursive:true})).filter(f=>/\.(js|html)$/.test(f)).map(f=>'study/live/'+f);
  files.push('factchat/index.html');
  for(const file of files){
    const body=await read('education/'+file);
    const type=file.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8';
    const service={fetch:async()=>new Response(body,{status:200,headers:{'content-type':type}})};
    const response=await routeCanonicalSurface(new Request('https://ekodi.kr/edu/'+file),{EDUCATION:service});
    assert.equal(response.status,200,file);
    assert.equal(await response.text(),body,file+' was rewritten by the /edu router');
  }
  const {qrSvg}=await import('../education/study/live/engine/qr.js');
  assert.doesNotMatch(qrSvg('x'),/\/>/,'QR SVG must not use self-closing tags that the router can rewrite');
  const {livePath,learnerUrl:lu}=await import('../education/study/live/engine/model.js');
  assert.equal(livePath('/edu/study/live/lab/','?c=x'),'/edu/study/live/?c=x');
  assert.equal(livePath('/study/live/present/','lab/'),'/study/live/lab/');
  assert.equal(lu('https://ekodi.kr','/edu/factchat/',{c:'a'}),'https://ekodi.kr/edu/study/live/lab/?c=a');
});

test('instructor intro: public facts only, portrait asset present, intro and hooks open the sessions',async()=>{
  const {INSTRUCTOR}=await import('../education/study/live/courses/instructor.js');
  const {stat}=await import('node:fs/promises');
  const src=await read('education/study/live/courses/instructor.js');
  assert.doesNotMatch(src,/01[016789]-?\d{3,4}-?\d{4}|@[a-z0-9.-]+\.[a-z]{2,}|\d{3}-\d{2}-\d{5}/i,'no phone, e-mail or business ID in public instructor data');
  assert.ok((await stat(new URL('../education/study/live/'+INSTRUCTOR.photo,import.meta.url))).size>10000);
  assert.ok(INSTRUCTOR.sites.every(x=>/^https:\/\//.test(x.url)));
  const s1=sessionSlides(COURSE,1),s2=sessionSlides(COURSE,2);
  assert.deepEqual(s1.slice(0,4).map(x=>x.special),['join','instructor','outcomes','hook']);
  assert.deepEqual(s2.slice(0,3).map(x=>x.special),['join','outcomes','hook']);
  assert.ok(COURSE.sessions.every(x=>x.outcomes.length>=2));
  const {instructorCard}=await import('../education/study/live/engine/render.js');
  const html=instructorCard(INSTRUCTOR,'/edu/study/live/');
  assert.match(html,/src="\/edu\/study\/live\/img\/instructor\.jpg"/);
  assert.match(html,/에코디언을 찾아서/);
  // Confirmed titles (2026-10-22) and a gallery of official activity-video stills that link to their source.
  assert.ok(INSTRUCTOR.roles.some(x=>/목사/.test(x))&&INSTRUCTOR.roles.some(x=>/박사/.test(x)));
  assert.equal(INSTRUCTOR.gallery.length,3);
  assert.ok(INSTRUCTOR.gallery.every(g=>/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/.test(g.src)&&/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(g.href)&&g.alt&&g.caption));
  assert.equal((html.match(/<figure>/g)||[]).length,3);
  assert.match(html,/src="https:\/\/i\.ytimg\.com\/vi\/CHWgslHyHYI\/hqdefault\.jpg"[^>]*referrerpolicy="no-referrer"/);
  assert.doesNotMatch(html,/\/edu\/study\/live\/https:/,'absolute media is not prefixed');
  assert.match(instructorCard(INSTRUCTOR,'/edu/study/live/',{compact:true}),/ins-card is-compact/);
});

test('stage switching: lecture / learner lab / side-by-side is shared state the audience window follows',async()=>{
  let st=initialState(COURSE.id);
  assert.equal(st.stage.mode,'slide');
  st=reduce(st,{type:'blackout/set',value:true},1);
  const lab=reduce(st,{type:'stage/mode',mode:'lab'},2);
  assert.equal(lab.stage.mode,'lab');assert.equal(lab.blackout,false,'switching the stage reveals it');
  assert.equal(reduce(lab,{type:'stage/mode',mode:'lab'},3),lab,'no-op keeps revision');
  assert.equal(reduce(lab,{type:'stage/mode',mode:'iframe-anything'},3),lab,'unknown modes are ignored');
  assert.equal(sanitizeState({...lab,stage:{mode:'evil'}},COURSE.id).stage.mode,'slide');
  assert.equal(sanitizeState({...lab},COURSE.id).stage.mode,'lab');
  const {embeddedLabUrl,showFactchatTab}=await import('../education/study/live/engine/render.js');
  const u=new URL(embeddedLabUrl('https://ekodi.kr/edu/study/live/lab/?c=mnu-factchat-2026&s=1&m=hwp&lv=basic&e=1999999999999'));
  assert.equal(u.origin,'https://ekodi.kr');assert.equal(u.searchParams.get('embed'),'1');assert.equal(u.searchParams.has('e'),false);
  // FactChat is opened as its own tab (never framed); the opener link is cut before navigating.
  const calls=[];const fake={location:{href:'about:blank',replace:url=>calls.push(url)},opener:{},focus(){calls.push('focus');}};
  const r=showFactchatTab({open:()=>fake},FACTCHAT_TOOL.entryUrl);
  assert.deepEqual(r,{ok:true,fresh:true});assert.equal(fake.opener,null);assert.deepEqual(calls,[FACTCHAT_TOOL.entryUrl,'focus']);
  assert.deepEqual(showFactchatTab({open:()=>null},FACTCHAT_TOOL.entryUrl),{ok:false,fresh:false});
  const presenter=await readFile(new URL('../education/study/live/present/index.html',import.meta.url),'utf8');
  for(const m of ['slide','lab','split'])assert.match(presenter,new RegExp('data-stage-mode="'+m+'"'));
  const js=await readFile(new URL('../education/study/live/present.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/factchat\.bot[^'"]*['"][^;]*iframe/i);
  assert.match(js,/class="stage-embed" src="'\+esc\(src\)/,'only the same-origin lab is embedded');
});

test('after the shared basics, every practice runs per field at the same time',()=>{
  for(const s of COURSE.sessions){
    const slides=sessionSlides(COURSE,s.no);
    const firstPractice=s.modules.findIndex(m=>m.kind==='practice');
    assert.ok(firstPractice>0&&s.modules.slice(0,firstPractice).every(m=>m.kind!=='practice'),'basics come before practice');
    for(const m of s.modules.filter(x=>x.kind==='practice')){
      const t=slides.find(x=>x.moduleId===m.id&&x.special==='tracks');
      assert.ok(t,m.id+' needs a per-field slide');
      assert.equal(t.tracks.length,COURSE.tracks.length);
      assert.ok(t.tracks.every(x=>x.label&&x.task),m.id);
      const order=slides.filter(x=>x.moduleId===m.id).map(x=>x.special||'-');
      assert.ok(order.indexOf('tracks')<order.indexOf('join'),'fields are introduced before the QR');
    }
  }
});

test('learner lab shows the same short instructor card in every session; full profile folds out',async()=>{
  const {INSTRUCTOR}=await import('../education/study/live/courses/instructor.js');
  const {instructorCard}=await import('../education/study/live/engine/render.js');
  const lab=await readFile(new URL('../education/study/live/lab.js',import.meta.url),'utf8');
  assert.ok(lab.includes("''),{compact:true})")&&!/compact:s\.no/.test(lab),'same compact card in every session');
  const html=instructorCard(INSTRUCTOR,'/edu/study/live/',{compact:true});
  assert.match(html,/<details class="ins-more">/);
  assert.match(html,/에코디교회 목사/);assert.equal((html.match(/<figure>/g)||[]).length,3);
  const css=await readFile(new URL('../education/study/live/live.css',import.meta.url),'utf8');
  assert.match(css,/\.lv \.ins-photo\{width:100%;height:auto;aspect-ratio:1;/,'portrait keeps its square aspect');
});

test('learner lab v3: view-and-copy materials, copy→FactChat, sticky detailed order, adjustable timer, no reference dump',async()=>{
  const lab=await readFile(new URL('../education/study/live/lab.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../education/study/live/lab/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(lab,/전체 안내 보기|missionSections|data-download=/,'no long reference block, no forced download');
  assert.match(lab,/data-view-material=/);assert.match(lab,/data-copy-open=/);assert.match(lab,/execCommand\('copy'\)/);
  assert.match(html,/id="matSheet"[^>]*hidden/);assert.match(html,/data-sheet-copy-open/);
  assert.match(html,/id="labSubnav"/);assert.match(lab,/IntersectionObserver/);
  assert.match(html,/data-timer-add="-60000"/);assert.match(html,/data-timer-add="60000"/);
  assert.match(html,/<details class="lab-settings" id="labSettings">/);assert.match(html,/id="labRole"/);
  assert.doesNotMatch(html,/−/,'U+2212 is not in the Pretendard subset');
});

test('mood slides use real Unsplash photos with credit; session 2 opens after session 1 or via the instructor link',async()=>{
  const {PHOTOS}=await import('../education/study/live/courses/photos.js');
  for(const ph of Object.values(PHOTOS)){assert.match(ph.src,/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?/);assert.ok(ph.alt&&ph.credit&&/^https:\/\/unsplash\.com\/photos\//.test(ph.page));}
  for(const n of [1,2]){
    const slides=sessionSlides(COURSE,n);
    const moods=slides.filter(x=>x.special==='mood');
    assert.ok(moods.length>=2,'session '+n+' has mood breaks');
    assert.ok(slides.filter(x=>x.special==='break').every(x=>x.photo),'break slides carry a photo');
    assert.notEqual(slides[1].special,'mood','no mood slide in the opening sequence');
  }
  const {slideHtml}=await import('../education/study/live/engine/render.js');
  const mood=sessionSlides(COURSE,1).find(x=>x.special==='mood');
  const html=slideHtml(mood,{});
  assert.match(html,/class="slide-photo" src="https:\/\/images\.unsplash\.com\//);assert.match(html,/Photo · [^<]+ \/ Unsplash/);
  assert.match(learnerUrl('https://ekodi.kr','/edu/study/live/present/',{c:COURSE.id,s:2}),/[?&]open=1/);
  assert.doesNotMatch(learnerUrl('https://ekodi.kr','/edu/study/live/present/',{c:COURSE.id,s:1}),/open=/);
  assert.equal(parseLearnerParams('?s=2&open=1',COURSE).open,true);
  const lab=await readFile(new URL('../education/study/live/lab.js',import.meta.url),'utf8');
  assert.match(lab,/const sessionLocked=no=>no>1&&!rec\.unlocked&&!firstSessionDone\(\)/);
});

test('presenter AI demo: institutional FactChat through the EKODI server route only, result mirrored as text',async()=>{
  let st=initialState(COURSE.id);
  st=reduce(st,{type:'stage/mode',mode:'ai'},1);assert.equal(st.stage.mode,'ai');
  st=reduce(st,{type:'ai/set',status:'done',prompt:'p',text:'x'.repeat(20000),model:'m',units:'u'},2);
  assert.equal(st.ai.text.length,12000);assert.equal(sanitizeState({...st,ai:{status:'evil'}},COURSE.id).ai.status,'idle');
  const demo=await import('../education/study/live/engine/factchat-demo.js');
  const store=new Map();
  const win=(hash='',host='ekodi.kr')=>({location:{hash,hostname:host,href:'https://'+host+'/edu/study/live/present/?c=mnu-factchat-2026'+hash,pathname:'/edu/study/live/present/',search:'?c=mnu-factchat-2026'},
    sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},history:{replaceState(){}},fetch:null});
  assert.equal((await demo.runInstitutionDemo(win(),'hi',{fetchImpl:async()=>{throw new Error('must not call');}})).login,true,'no token → login, no request');
  assert.equal(demo.acceptAdminHandoff(win('#ekodi_admin_token=tok123')),true);assert.equal(store.get('ekodi-auth-token'),'tok123');
  const login=new URL(demo.adminLoginUrl(win()));
  assert.equal(login.origin+login.pathname,'https://ekodi.kr/auth/');assert.equal(login.searchParams.get('site'),'admin');
  assert.equal(login.searchParams.get('return_to'),'https://ekodi.kr/edu/study/live/present/?c=mnu-factchat-2026');
  assert.equal(demo.adminLoginUrl(win('','preview.example.org')),'','only the canonical apex host can receive the handoff');
  let seen;
  const ok=await demo.runInstitutionDemo(win(),'프롬프트',{fetchImpl:async(url,init)=>{seen={url,init};return {ok:true,status:200,json:async()=>({ok:true,text:'답',model:'gpt-x',usage:{inputUnits:3,outputUnits:5}})};}});
  assert.equal(ok.ok,true);assert.equal(ok.text,'답');
  assert.equal(seen.url,'https://ekodi.kr/api/ai-modules/v1/providers/admin/factchat-institution/playground');
  assert.equal(seen.init.headers.authorization,'Bearer tok123');assert.equal(seen.init.headers['x-ekodi-confirm-impact'],'factchat-institution-playground');
  const denied=await demo.runInstitutionDemo(win(),'p',{fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:'institution_account_approval_required'})})});
  assert.match(denied.message,/승인/);
  const expired=await demo.runInstitutionDemo(win(),'p',{fetchImpl:async()=>({ok:false,status:401,json:async()=>({})})});
  assert.equal(expired.login,true);assert.equal(store.has('ekodi-auth-token'),false,'expired token cleared');
  const src=await readFile(new URL('../education/study/live/engine/factchat-demo.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/FACTCHAT_MOKPO_API_KEY|mokpo\.factchat\.bot\/api|sk-[A-Za-z0-9]/,'no key or direct provider call in the browser');
  const auth=await readFile(new URL('../auth-site/admin-auth.js',import.meta.url),'utf8');
  assert.match(auth,/u\.pathname==='\/edu\/study\/live\/'\|\|u\.pathname==='\/edu\/study\/live\/present\/'\)\)return u\.href;/,'exact presenter paths only');
  assert.doesNotMatch(auth,/pathname\.startsWith\('\/edu/,'no /edu prefix wildcard');
});
