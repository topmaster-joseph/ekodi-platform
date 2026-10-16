import { assessResearch, cleanResearchInput, RESEARCH_STAGES } from './planner.js';
const config=window.EKODI_RESEARCH_CONFIG||{dataEnabled:false};
const $=q=>document.querySelector(q);
const storageKey='ekodi_research_non_sensitive_plans_v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={projects:[],session:null,client:null,editingId:null};
const fields=['title','field','kind','stage','next_step'];
function localRead(){try{const v=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.id==='string').slice(0,100):[]}catch{return []}}
function localWrite(){localStorage.setItem(storageKey,JSON.stringify(state.projects))}
function stageLabel(id){return RESEARCH_STAGES.find(x=>x.id===id)?.label||'연구주제 선정'}
function message(selector,text){const el=$(selector);if(el)el.textContent=text}
function render(){
 const host=$('#projectList');host.replaceChildren();
 $('#projectCount').textContent=state.projects.length+'개';
 if(!state.projects.length){const p=document.createElement('p');p.className='empty';p.textContent='등록된 프로젝트가 없습니다.';host.append(p);return}
 for(const p of state.projects){
  const card=document.createElement('article');card.className='project';
  const meta=document.createElement('div');meta.className='metadata';meta.textContent=stageLabel(p.stage)+' · '+(p.field||'분야 미지정');
  const title=document.createElement('h4');title.textContent=p.title;
  const next=document.createElement('p');next.textContent='다음 행동: '+(p.next_step||'아직 정하지 않았습니다.');
  const controls=document.createElement('div');controls.className='controls';
  const advance=document.createElement('button');advance.type='button';advance.textContent='다음 단계';
  advance.disabled=RESEARCH_STAGES.findIndex(x=>x.id===p.stage)===RESEARCH_STAGES.length-1;
  advance.addEventListener('click',()=>advanceProject(p.id));
  const edit=document.createElement('button');edit.type='button';edit.textContent='수정';
  edit.addEventListener('click',()=>startEditProject(p.id));
  const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';
  remove.addEventListener('click',()=>deleteProject(p.id));
  controls.append(edit,advance,remove);card.append(meta,title,next,controls);host.append(card);
 }
}
function authUrl(){const url=new URL(config.authUrl||'https://ekodi.kr/auth/?site=research');url.searchParams.set('site','edu');url.searchParams.set('return_to',location.href);return url.toString()}
async function api(path,method='GET',body=null){
 if(!state.session)throw Error('로그인이 필요합니다.');
 const response=await fetch('./api/'+path,{method,headers:{authorization:'Bearer '+state.session.access_token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===401?'로그인 세션을 확인할 수 없습니다.':data.error||'요청에 실패했습니다.');
 return data;
}
async function loadProjects(){
 if(!config.dataEnabled){state.projects=localRead();render();return}
 if(!state.session){state.projects=[];render();return}
 try{state.projects=(await api('projects')).projects||[];render()}catch(error){message('#projectStatus',error.message)}
}
async function createProject(data){
 if(config.dataEnabled){await api('projects','POST',data);await loadProjects()}
 else{state.projects.unshift({...data,id:crypto.randomUUID(),created_at:new Date().toISOString()});state.projects=state.projects.slice(0,100);localWrite();render()}
}
function resetEdit(){
 state.editingId=null;$('#projectForm').reset();$('#projectSubmit').textContent='연구 프로젝트 등록';$('#cancelProjectEdit').hidden=true;
}
function startEditProject(id){
 const project=state.projects.find(x=>x.id===id);if(!project)return;
 state.editingId=id;
 const form=$('#projectForm');
 for(const field of fields){const control=form.elements.namedItem(field);if(control)control.value=project[field]||'';}
 $('#projectSubmit').textContent='프로젝트 변경 저장';$('#cancelProjectEdit').hidden=false;
 message('#projectStatus','연구계획을 수정하고 변경 저장을 누르세요.');
 form.scrollIntoView({behavior:'smooth',block:'center'});
 form.elements.namedItem('title')?.focus({preventScroll:true});
}
async function saveEditProject(data){
 const id=state.editingId;const project=state.projects.find(x=>x.id===id);
 if(!id||!project)throw Error('수정할 프로젝트를 찾을 수 없습니다.');
 if(config.dataEnabled){await api('projects/'+encodeURIComponent(id),'PATCH',data);await loadProjects();}
 else{Object.assign(project,data);localWrite();render();}
}
$('#cancelProjectEdit').addEventListener('click',()=>{resetEdit();message('#projectStatus','프로젝트 수정을 취소했습니다.');});
$('#exportPlans').addEventListener('click',()=>{
 if(config.dataEnabled)return;
 const payload={format:'ekodi-research-plans-v1',sensitivity:'non-sensitive-planning-only',exportedAt:new Date().toISOString(),projects:state.projects.map(x=>Object.fromEntries(['id',...fields,'created_at'].map(k=>[k,String(x[k]||'')])) )};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='ekodi-research-plan-backup.json';document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);message('#projectStatus','비민감 연구계획을 백업했습니다. 원고·개인정보는 입력하지 마세요.');
});
async function advanceProject(id){
 const project=state.projects.find(x=>x.id===id);if(!project)return;
 const index=RESEARCH_STAGES.findIndex(x=>x.id===project.stage);if(index>=5)return;
 const next={...project,stage:RESEARCH_STAGES[index+1].id};
 try{
  if(config.dataEnabled){await api('projects/'+encodeURIComponent(id),'PATCH',next);await loadProjects()}
  else{Object.assign(project,next);localWrite();render()}
 }catch(error){message('#projectStatus',error.message)}
}
async function deleteProject(id){
 if(!confirm('이 연구 계획 항목을 삭제하시겠습니까?'))return;
 try{
  if(config.dataEnabled){await api('projects/'+encodeURIComponent(id),'DELETE');await loadProjects()}
  else{state.projects=state.projects.filter(x=>x.id!==id);localWrite();render()}
  if(state.editingId===id)resetEdit();
 }catch(error){message('#projectStatus',error.message)}
}
$('#menuToggle').addEventListener('click',()=>{const nav=$('#siteNav');const open=nav.classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open))});
document.querySelectorAll('#siteNav a').forEach(a=>a.addEventListener('click',()=>{$('#siteNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false')}));
$('#diagnosisForm').addEventListener('submit',async event=>{
 event.preventDefault();message('#diagnosisStatus','진단 중입니다.');
 const input=cleanResearchInput(Object.fromEntries(new FormData(event.currentTarget)));
 try{
  const response=await fetch('./api/diagnosis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  if(!response.ok)throw Error('서버 연결에 실패했습니다.');
  const data=(await response.json()).diagnosis;
  showDiagnosis(data);
 }catch{
  showDiagnosis(assessResearch(input));
  message('#diagnosisStatus','오프라인 규칙 기반 진단 결과입니다.');
 }
});
function showDiagnosis(data){
 const target=$('#diagnosisResult');target.replaceChildren();
 const title=document.createElement('h3');title.textContent='연구단계: '+data.stage+' ('+data.progress+'%)';
 const list=document.createElement('ol');for(const task of data.tasks){const li=document.createElement('li');li.textContent=task;list.append(li)}
 const end=document.createElement('p');end.textContent='추천 서비스: '+data.recommendation+' · '+data.notice;
 target.append(title,list,end);target.hidden=false;message('#diagnosisStatus','연구 로드맵을 만들었습니다.');target.scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('#projectForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;const value=Object.fromEntries(new FormData(form));
 if(!String(value.title||'').trim()||value.title.trim().length<3){message('#projectStatus','프로젝트명은 3자 이상 입력하세요.');return}
 if(config.dataEnabled&&!state.session){location.assign(authUrl());return}
 const payload=Object.fromEntries(fields.map(f=>[f,String(value[f]||'').trim()]));
 try{const editing=Boolean(state.editingId);if(editing)await saveEditProject(payload);else await createProject(payload);resetEdit();message('#projectStatus',editing?'프로젝트 변경사항을 저장했습니다.':'프로젝트를 등록했습니다.')}catch(error){message('#projectStatus',error.message)}
});
$('#consultingForm').addEventListener('submit',async event=>{
 event.preventDefault();const f=new FormData(event.currentTarget);
 try{
  const result=await api('consultations','POST',{service:f.get('service'),topic:f.get('topic'),preferred_time:f.get('preferred_time'),consent:f.has('consent')});
  event.currentTarget.reset();message('#consultingStatus','상담 요청 접수번호: '+result.id);
 }catch(error){message('#consultingStatus',error.message)}
});
async function setupAuth(){
 if(!config.dataEnabled){
  $('#workspaceMode').textContent='현재는 브라우저 임시 연구계획 모드입니다. 연구제목·일정만 저장되며 다른 기기와 동기화되지 않습니다. 원고와 개인정보는 입력하지 마세요.';
  $('#exportPlans').hidden=false;
  await loadProjects();return;
 }
 $('#workspaceMode').textContent='EKODI Google 로그인으로 연구실을 연결합니다. 모든 연구자료 열람은 서버에서 다시 검증합니다.';
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
 state.client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}});
 const params=new URLSearchParams(location.hash.slice(1));
 if(params.has('ekodi_token')){
  try{await state.client.auth.verifyOtp({token_hash:params.get('ekodi_token'),type:params.get('ekodi_type')||'email'})}
  finally{history.replaceState({},document.title,location.pathname+location.search)}
 }
 const {data}=await state.client.auth.getSession();state.session=data.session;
 const button=$('#authButton');button.hidden=false;button.textContent=state.session?'로그아웃':'Google 로그인';
 button.addEventListener('click',async()=>{if(state.session){await state.client.auth.signOut();state.session=null;button.textContent='Google 로그인';await loadProjects()}else location.assign(authUrl())});
 state.client.auth.onAuthStateChange((_e,next)=>{state.session=next;button.textContent=next?'로그아웃':'Google 로그인';loadProjects()});
 $('#consultingForm').hidden=!state.session;
 $('#consultingUnavailable').hidden=Boolean(state.session);
 await loadProjects();
}
setupAuth().catch(error=>{message('#workspaceMode','로그인 연결에 문제가 있습니다. 연구자료를 제출하지 마세요.');message('#projectStatus',error.message)});
