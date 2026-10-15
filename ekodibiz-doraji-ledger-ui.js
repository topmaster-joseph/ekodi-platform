export const dorajiLedgerClientScript=String.raw\`(()=>{
'use strict';
const root=document.querySelector('[data-ekodi-doraji-ledger]');
if(!root)return;
const API='/ekodibiz/doraji/api/v1';
const $=key=>root.querySelector('[data-ledger="'+key+'"]');
const banner=$('status'),login=$('login'),panel=$('panel'),projectSelector=$('project-select');
const projectForm=$('project-form'),recordForm=$('record-form'),records=$('records'),recordKind=$('record-kind');
const kinds={projects:'cultivation',cultivation:'cultivation',budget:'budget',contracts:'contract',delivery:'delivery',documents:'document'};
const initialKind=kinds[root.dataset.activeTab]||'cultivation';
let accessToken='',selectedProject='';
function say(message){banner.textContent=message;}
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);return node;}
function accessTokenFromUrl(){
 const fragment=new URLSearchParams(location.hash.replace(/^#/,''));const token=fragment.get('ekodi_admin_token');
 if(token){
  try{sessionStorage.setItem('ekodi-auth-token',token)}catch{}
  history.replaceState(history.state,'',location.pathname+location.search);
  return token;
 }
 try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return ''}
}
function loginUrl(){
 const target=new URL(location.href);target.hash='';
 const auth=new URL('/auth/',location.origin);
 auth.searchParams.set('site','admin');
 auth.searchParams.set('direct','1');
 auth.searchParams.set('return_to',target.href);
 return auth.href;
}
login.addEventListener('click',()=>{location.assign(loginUrl());});
async function request(path,{method='GET',body}={}){
 if(!accessToken)throw Object.assign(new Error('로그인 필요'),{status:401});
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const headers=new Headers({authorization:'Bearer '+accessToken});
  if(body!==undefined)headers.set('content-type','application/json');
  const response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'same-origin',signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'요청 실패'),{status:response.status});
  return data;
 }finally{clearTimeout(timeout)}
}
function errorMessage(error){
 if(error.status===401)return '관리자 인증이 만료됐습니다. 이 화면에서 다시 로그인하세요.';
 if(error.status===403)return '이 사업의 관리 권한이 없습니다.';
 if(error.status===404)return '사업 정보가 없거나 접근이 허용되지 않습니다.';
 if(error.status===409)return '다른 관리자가 먼저 수정했습니다. 목록을 다시 불러오세요.';
 if(error.status===503)return '운영 데이터베이스가 아직 준비되지 않았습니다. 저장 기능은 비활성 상태입니다.';
 return '업무원장을 불러오지 못했습니다. ('+String(error.message||'일시적 오류')+')';
}
function renderRecord(item){
 const card=element('article');card.className='ledger-item';
 const name=element('strong',item.title+' · '+item.record_date);
 const details=element('p',item.note||'작성된 메모 없음');
 const footer=element('small','초안 · '+item.kind+' · '+Number(item.quantity_kg||0).toLocaleString('ko-KR')+' kg · '+Number(item.amount_krw||0).toLocaleString('ko-KR')+' 원');
 card.append(name,details,footer);
 return card;
}
async function loadRecords(){
 records.replaceChildren();
 if(!selectedProject)return;
 const result=await request('/projects/'+selectedProject+'/records?kind='+encodeURIComponent(recordKind.value));
 for(const item of result.items||[])records.append(renderRecord(item));
 if(!(result.items||[]).length)records.append(element('p','등록된 초안 자료가 없습니다.'));
}
async function loadProjects(){
 const data=await request('/projects');
 projectSelector.replaceChildren();
 projectSelector.append(element('option','사업단위를 선택하세요'));
 projectSelector.firstElementChild.value='';
 for(const item of data.items||[]){
  const option=element('option',item.name+' ('+item.region+')');
  option.value=item.id;
  projectSelector.append(option);
 }
 if(selectedProject&&(data.items||[]).some(p=>p.id===selectedProject))projectSelector.value=selectedProject;
 else selectedProject=projectSelector.value='';
 recordForm.hidden=!selectedProject;
 if(selectedProject)await loadRecords();
 else records.replaceChildren();
 say('관리자 인증 완료 · 초안 업무자료만 저장할 수 있습니다. 계약 서명·실제 지급은 불가능합니다.');
}
async function initialize(){
 accessToken=accessTokenFromUrl();
 recordKind.value=initialKind;
 if(!accessToken){panel.hidden=true;login.hidden=false;say('업무자료는 관리자 로그인 후 볼 수 있습니다. 공개 사업 안내는 그대로 이용 가능합니다.');return;}
 try{
  await loadProjects();
  panel.hidden=false;login.hidden=true;
 }catch(error){
  if(error.status===401){accessToken='';try{sessionStorage.removeItem('ekodi-auth-token')}catch{}}
  panel.hidden=true;login.hidden=false;say(errorMessage(error));
 }
}
projectSelector.addEventListener('change',async()=>{
 selectedProject=projectSelector.value;
 recordForm.hidden=!selectedProject;
 try{await loadRecords()}catch(error){say(errorMessage(error))}
});
recordKind.addEventListener('change',async()=>{try{await loadRecords()}catch(error){say(errorMessage(error))}});
projectForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!accessToken)return;
 const payload={
  name:$('project-name').value.trim(),
  region:$('project-region').value.trim(),
  greenhouseCount:Number($('project-houses').value||0),
  areaSqm:Number($('project-area').value||0),
 };
 if(!payload.name){say('사업단위 이름을 입력하세요.');return;}
 const submit=projectForm.querySelector('[type="submit"]');submit.disabled=true;
 try{
  const r=await request('/projects',{method:'POST',body:payload});
  selectedProject=r.id;
  projectForm.reset();
  await loadProjects();
 }catch(error){say(errorMessage(error))}
 finally{submit.disabled=false}
});
recordForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!selectedProject||!accessToken)return;
 const data={
  kind:recordKind.value,
  date:$('record-date').value,
  title:$('record-title').value.trim(),
  note:$('record-note').value.trim(),
  quantityKg:Number($('record-quantity').value||0),
  amountKRW:Number($('record-amount').value||0),
  counterparty:$('record-party').value.trim(),
 };
 if(!data.title||!data.date){say('일자와 제목을 입력하세요.');return;}
 const submit=recordForm.querySelector('[type="submit"]');submit.disabled=true;
 try{
  await request('/projects/'+selectedProject+'/records',{method:'POST',body:data});
  recordForm.reset();recordKind.value=data.kind;
  $('record-date').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  await loadRecords();say('초안을 저장했습니다. 승인·계약 서명·대금 지급과는 무관합니다.');
 }catch(error){say(errorMessage(error))}
 finally{submit.disabled=false}
});
$('record-date').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
initialize();
})();\`;
