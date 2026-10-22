// EKODI Education Live — reusable course engine (pure functions, no DOM, no network).
// Common structure: Course → Session → Module(timeline block) → Activity(lecture/demo/practice/review)
// → Practice(mission) → Assessment(criteria/rubric) → Artifact(deliverable).
// New courses add a data file; they never copy this engine.

export const COURSE_SCHEMA='ekodi-education-course/v1';
export const MODULE_KINDS=Object.freeze(['lecture','demo','practice','break','review','share']);
export const KIND_LABELS=Object.freeze({lecture:'강의',demo:'강사 시연',practice:'개인 실습',break:'휴식',review:'검증·공유',share:'적용 계획'});

const ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
const fail=message=>{throw new Error('[course] '+message)};

export function validateCourse(course){
  if(!course||course.schema!==COURSE_SCHEMA)fail('unsupported schema');
  if(!ID.test(course.id||''))fail('invalid course id');
  if(!Array.isArray(course.sessions)||!course.sessions.length)fail('no sessions');
  const missionIds=new Set(Object.keys(course.missions||{}));
  const trackIds=new Set((course.tracks||[]).map(t=>t.id));
  const moduleIds=new Set();
  for(const session of course.sessions){
    if(!Number.isInteger(session.no)||session.no<1)fail('invalid session number');
    let cursor=0;
    for(const mod of session.modules){
      if(!ID.test(mod.id||''))fail('invalid module id '+mod.id);
      if(moduleIds.has(mod.id))fail('duplicate module id '+mod.id);
      moduleIds.add(mod.id);
      if(!MODULE_KINDS.includes(mod.kind))fail('invalid kind '+mod.kind);
      if(mod.start!==cursor)fail('timeline gap before '+mod.id);
      if(!(mod.end>mod.start))fail('invalid range '+mod.id);
      cursor=mod.end;
      if(mod.kind==='practice'){
        const mission=course.missions[mod.missionId];
        if(!mission)fail('missing mission '+mod.missionId);
        if(mission.minutes!==mod.end-mod.start)fail('mission minutes mismatch '+mod.id);
      }
    }
    if(cursor!==session.minutes)fail('session '+session.no+' does not total '+session.minutes+' minutes');
  }
  for(const id of missionIds){
    const m=course.missions[id];
    for(const level of course.levels){
      const base=levelBase(level);
      if(!Array.isArray(m.criteria?.[base])||!m.criteria[base].length)fail('mission '+id+' lacks criteria for '+level.id);
      if(typeof m.levelAddenda?.[base]!=='string')fail('mission '+id+' lacks level addendum '+level.id);
    }
    const materials=course.trackMaterials?.[id];
    for(const track of trackIds)if(!materials?.[track])fail('mission '+id+' lacks material for track '+track);
  }
  return true;
}

export const totalMinutes=course=>course.sessions.reduce((sum,s)=>sum+s.minutes,0);
export const practiceModules=course=>course.sessions.flatMap(s=>s.modules.filter(m=>m.kind==='practice').map(m=>({session:s.no,...m})));
export const practiceMinutes=course=>practiceModules(course).reduce((sum,m)=>sum+(m.end-m.start),0);
export const sessionByNo=(course,no)=>course.sessions.find(s=>s.no===Number(no))||null;
export const moduleIndexAtMinute=(session,minute)=>{const i=session.modules.findIndex(m=>minute>=m.start&&minute<m.end);return i<0?session.modules.length-1:i;};
export const trackById=(course,id)=>course.tracks.find(t=>t.id===id)||course.tracks[0];
export const levelById=(course,id)=>course.levels.find(l=>l.id===id)||course.levels.find(l=>l.id==='basic')||course.levels[0];
// Finer levels reuse a base level's criteria and mission addendum (level.base) and may add their own addendum.
export const levelBase=level=>level?.base||level?.id;
export const criteriaFor=(mission,level)=>mission.criteria[levelBase(level)]||[];
export const roleById=(course,trackId,roleId)=>trackById(course,trackId).roles?.find(r=>r.id===roleId)||null;
export function missionSessionModule(course,missionId){
  for(const s of course.sessions){const m=s.modules.find(x=>x.missionId===missionId);if(m)return {session:s.no,module:m};}
  return null;
}

export function missionContext(course,missionId,trackId){
  const track=trackById(course,trackId);
  const raw=course.trackMaterials?.[missionId]?.[track.id];
  const base=Array.isArray(raw)?{ideas:raw}:{...(raw||{})};
  return {...base,trackId:track.id,label:track.label,ideas:base.ideas||course.trackMaterials?.free?.[track.id]||[]};
}

// One-line task title of a field's practice material (HWP document, meeting, presentation topic, idea).
export function trackTaskTitle(course,missionId,trackId){
  const c=missionContext(course,missionId,trackId);
  return c.doc||c.meeting||c.topic||c.ideas?.[0]||'';
}

export function buildPrompts(course,missionId,trackId,levelId,roleId=''){
  const mission=course.missions[missionId];
  if(!mission)return [];
  const ctx=missionContext(course,missionId,trackId);
  const level=levelById(course,levelId);
  const addendum=[mission.levelAddenda?.[levelBase(level)]||'',level.addendum||''].filter(Boolean).join('\n');
  const role=roleById(course,trackId,roleId);
  return mission.prompts.map((p,index)=>{
    let text=String(p.build(ctx)||'').trim();
    if(role&&index===0)text='[내 업무] '+ctx.label+' · '+role.label+' 담당입니다. 이 업무 맥락에 맞는 표현과 항목으로 작성해 주세요.\n\n'+text;
    if(addendum&&index===0)text+='\n\n'+addendum;
    return {label:p.label,text};
  });
}

export function missionMaterials(course,missionId,trackId){
  const ctx=missionContext(course,missionId,trackId);
  const mission=course.missions[missionId];
  const files=[];
  const stamp=course.id+'_'+missionId+'_'+ctx.trackId;
  if(ctx.source)files.push({name:stamp+'_source.txt',label:'실습 원문 (HWP 초안용)',text:ctx.source});
  if(ctx.script)files.push({name:stamp+'_meeting-script.txt',label:'가상 회의 대본 (낭독·녹음용)',text:ctx.script});
  if(ctx.facts)files.push({name:stamp+'_report-facts.txt',label:'보고 내용 원문',text:ctx.facts});
  if(mission?.fallback?.sampleOutput)files.push({name:stamp+'_fallback-practice.txt',label:'대체 실습 자료 (오류 찾기)',text:mission.fallback.sampleOutput});
  return files;
}

function slide(base){return Object.freeze({bullets:[],p:'',special:'',...base});}
export function moduleSlides(course,session,mod){
  const range=mod.start+'–'+mod.end+'분 · '+(KIND_LABELS[mod.kind]||'');
  const out=[];
  if(mod.kind==='practice'){
    const m=course.missions[mod.missionId];
    out.push(slide({id:mod.id+'-a',moduleId:mod.id,k:range,t:m.title,p:m.problem,bullets:['왜: '+m.why,'결과물: '+m.deliverable,m.pcOnly?'PC 전용 실습 · 모바일은 대체 실습':'PC 권장 · 모바일 참여 가능']}));
    // Shared basics are over: everyone practises now, at the same time, each with their own field's material.
    out.push(slide({id:mod.id+'-t',moduleId:mod.id,k:range+' · 분야별 동시 실습',t:'같은 시간, 각자 내 업무로',p:'실습실에서 내 분야를 고르면 그 분야의 가상 원문과 프롬프트가 열립니다.',special:'tracks',
      tracks:course.tracks.map(t=>({label:t.label,task:trackTaskTitle(course,m.id,t.id)}))}));
    out.push(slide({id:mod.id+'-b',moduleId:mod.id,k:range+' · 따라 하기',t:'따라 하기 '+m.steps.length+'단계',bullets:m.steps}));
    out.push(slide({id:mod.id+'-c',moduleId:mod.id,k:range+' · 실습실 입장',t:'QR로 실습실에 들어오세요',p:'직무를 고르면 내 업무에 맞는 원문과 프롬프트가 나옵니다.',special:'join',missionId:m.id}));
    out.push(slide({id:mod.id+'-d',moduleId:mod.id,k:range+' · 검증',t:'제출 전 반드시 확인',bullets:m.errors}));
    return out;
  }
  if(mod.kind==='break'){
    out.push(slide({id:mod.id+'-a',moduleId:mod.id,k:range,t:mod.title,p:mod.summary,special:'break'}));
    return out;
  }
  if(mod.hook)out.push(slide({id:mod.id+'-hook',moduleId:mod.id,k:'오늘의 질문',t:mod.hook.q,p:mod.hook.sub,special:'hook'}));
  out.push(slide({id:mod.id+'-a',moduleId:mod.id,k:range,t:mod.title,p:mod.summary}));
  if(mod.points?.length)out.push(slide({id:mod.id+'-b',moduleId:mod.id,k:range+' · 핵심',t:mod.title,bullets:mod.points}));
  if(mod.learner?.quiz)out.push(slide({id:mod.id+'-q',moduleId:mod.id,k:range+' · OX 퀴즈',t:'OX 퀴즈 — 실습실에서 풀어 보세요',bullets:course.quiz.map((q,i)=>(i+1)+'. '+q.q),special:'join'}));
  if(mod.errorHunt){
    const hunt=course.errorHunts.find(h=>h.id===mod.errorHunt);
    if(hunt)out.push(slide({id:mod.id+'-h',moduleId:mod.id,k:range+' · AI 오류 찾기',t:hunt.title,p:hunt.text,bullets:[hunt.hint],special:'hunt'}));
  }
  return out;
}
export function sessionSlides(course,sessionNo){
  const session=sessionByNo(course,sessionNo);
  if(!session)return [];
  const opening=slide({id:'s'+session.no+'-open',moduleId:session.modules[0].id,k:course.subtitle+' · '+session.no+'회차',t:session.title,p:course.title+' — '+course.format,special:'join'});
  const intro=[];
  if(session.no===1&&course.instructor)intro.push(slide({id:'s1-instructor',moduleId:session.modules[0].id,k:'오늘의 강사',t:course.instructor.name,p:course.instructor.headline,special:'instructor'}));
  if(session.outcomes?.length)intro.push(slide({id:'s'+session.no+'-outcomes',moduleId:session.modules[0].id,k:session.no+'회차 · 오늘 손에 쥐고 나갈 것',t:'끝날 때 여러분 손에 남는 것',bullets:session.outcomes,special:'outcomes'}));
  return [opening,...intro,...session.modules.flatMap(m=>moduleSlides(course,session,m))];
}

// Learner join links carry only non-personal pointers: course, session, mission, level and an optional
// practice end time so every device shows the same countdown without any server.
// The canonical /edu alias rewrites every quoted string that starts with a slash inside served JavaScript
// (canonical-surface-router prefixRootLiterals). Paths and separators are therefore built from SLASH so the
// same code is correct on ekodi.kr/edu/... and on the Education origin without a prefix.
export const SLASH=String.fromCharCode(47);
const segs=(...parts)=>SLASH+parts.join(SLASH)+SLASH;
export const LIVE_PATH=segs('study','live');
export const FACTCHAT_PATH=segs('factchat');
export function liveBase(pathname){
  const path=String(pathname||SLASH);
  const idx=path.indexOf(LIVE_PATH);
  if(idx>=0)return path.slice(0,idx);
  const f=path.indexOf(FACTCHAT_PATH);
  return f>=0?path.slice(0,f):'';
}
export const livePath=(pathname,sub='')=>liveBase(pathname)+LIVE_PATH+sub;
export const sitePath=(pathname,sub='')=>liveBase(pathname)+SLASH+sub;
export function learnerUrl(origin,pathname,params){
  const url=new URL(livePath(pathname,'lab'+SLASH),origin);
  const p=params||{};
  if(p.c)url.searchParams.set('c',p.c);
  if(p.s)url.searchParams.set('s',String(p.s));
  if(p.m)url.searchParams.set('m',p.m);
  if(p.lv)url.searchParams.set('lv',p.lv);
  if(Number.isFinite(p.e)&&p.e>0)url.searchParams.set('e',String(Math.round(p.e)));
  return url.href;
}
export function parseLearnerParams(search,course){
  const q=new URLSearchParams(search||'');
  const s=Number(q.get('s'));
  const m=q.get('m');
  const lv=q.get('lv');
  const e=Number(q.get('e'));
  return {
    c:q.get('c')||course?.id||'',
    s:course&&sessionByNo(course,s)?s:1,
    m:course&&m&&course.missions[m]?m:'',
    lv:course&&lv&&course.levels.some(l=>l.id===lv)?lv:'',
    e:Number.isFinite(e)&&e>0?e:0
  };
}

export function formatClock(ms){
  const neg=ms<0;const total=Math.floor(Math.abs(ms)/1000);
  const h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
  const body=(h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s).padStart(2,'0');
  return (neg?'-':'')+body;
}

export function courseMarkdown(course,{notes=null,tool=null}={}){
  const lines=['# '+course.subtitle+' — '+course.title,'','- 대상: '+course.audience,'- 구성: '+course.format,'- 상태: '+course.status,'- 자료: 모든 실습자료는 가상(허구)입니다.',''];
  if(tool)lines.push('- 실행 도구: '+tool.name+' (공식 사이트 직접 로그인, EKODI 연동 없음) · 공식 문서 기준일 '+tool.docsAsOf,'');
  for(const s of course.sessions){
    lines.push('## '+s.no+'회차 · '+s.title+' ('+s.minutes+'분)','','| 시간 | 구분 | 주제 |','|---|---|---|');
    for(const m of s.modules)lines.push('| '+m.start+'~'+m.end+'분 | '+(KIND_LABELS[m.kind]||m.kind)+' | '+(m.title||'')+' |');
    lines.push('');
    for(const m of s.modules){
      const mission=m.kind==='practice'?course.missions[m.missionId]:null;
      lines.push('### '+m.start+'~'+m.end+'분 '+(mission?mission.title:m.title));
      if(mission){
        lines.push('','- 무엇을 해결: '+mission.problem,'- 왜 필요: '+mission.why,'- 결과물: '+mission.deliverable,'- 따라 하기:');
        mission.steps.forEach((st,i)=>lines.push('  '+(i+1)+'. '+st));
        lines.push('- 검증할 오류:');mission.errors.forEach(e=>lines.push('  - '+e));
        lines.push('- 달성 조건(난이도별): '+course.levels.map(l=>l.label+' — '+criteriaFor(mission,l).join(', ')).join(' / '));
      }else{
        if(m.summary)lines.push('',m.summary);
        (m.points||[]).forEach(p=>lines.push('- '+p));
      }
      const n=notes?.[m.id];
      if(n){
        lines.push('','> 강사 노트');
        [...(n.talk||[]),...(n.cues||[]).map(c=>'⏱ '+c),...(n.demo||[]).map(d=>'시연: '+d)].forEach(t=>lines.push('> - '+t));
        if(n.answer)lines.push('> - 정답: '+n.answer);
      }
      lines.push('');
    }
  }
  lines.push('## 평가 기준 (문자열 일치가 아닌 품질 기준)','');
  course.rubric.forEach(r=>lines.push('- '+r.label+': '+r.desc));
  lines.push('','## 안전 원칙','',course.safety,'');
  return lines.join('\n');
}
