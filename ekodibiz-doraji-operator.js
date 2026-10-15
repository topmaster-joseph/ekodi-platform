export const dorajiOperatorScript=String.raw`(()=>{
'use strict';
const BASE='/ekodibiz/doraji/api/v1',TOKEN_KEY='ekodi-auth-token';
const $=id=>document.getElementById(id);
const state={token:'',projects:[],selected:'',kind:'cultivation'};
const canView=()=>Boolean(state.token);
function message(value,kind='info'){const el=$('office-status');el.textContent=value;el.dataset.kind=kind}
function clear(node){while(node.firstChild)node.removeChild(node.firstChild)}
function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el}
function line(tag,text,cls=''){const el=document.createElement(tag);el.textContent=String(text??'');if(cls)el.className=cls;return el}
function refreshVisibility(active){$('office-data').hidden=!active;$('office-login').hidden=active}
function lostAuth(reason){state.token='';refreshVisibility(false);message(reason,'error')}
async function call(path,method='GET',body){
 if(!state.token)throw Object.assign(new Error('로그인이 필요합니다.'),{status:401});
 const headers={authorization:'Bearer '+state.token,accept:'application/json'};
 if(body!==undefined)headers['content-type']='application/json';
 const response=await fetch(BASE+path,{method,headers,cache:'no-store',credentials:'omit',redirect:'manual',body:body===undefined?undefined:JSON.stringify(body)});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok||!data.ok){
  const labels={authentication_required:'관리자 로그인이 만료됐습니다.',admin_not_registered:'등록된 관리자 권한이 없습니다.',ledger_unavailable:'업무원장 운영 DB를 준비하고 있습니다. 데이터가 저장되지 않았습니다.',version_conflict:'다른 관리자가 먼저 수정했습니다. 다시 조회해 주세요.',forbidden:'이 프로젝트에 수정 권한이 없습니다.',not_found:'프로젝트를 찾을 수 없거나 접근권한이 없습니다.'};
  throw Object.assign(new Error(labels[data.error]||'요청을 완료할 수 없습니다. ('+response.status+')'),{status:response.status});
 }
 return data;
}
function selectProject(){
 const select=$('project-select');clear(select);select.append(option('','단위사업 선택'));
 for(const p of state.projects)select.append(option(p.id,p.name+' · '+p.region));
 select.value=state.selected&&state.projects.some(p=>p.id===state.selected)?state.selected:'';
 state.selected=select.value;
 $('record-form').hidden=!state.selected;
 $('record-list').replaceChildren();
 $('audit-list').replaceChildren();
}
async function loadProjects(){
 const data=await call('/projects');
 state.projects=data.items||[];
 if(!state.projects.some(p=>p.id===state.selected))state.selected=state.projects[0]?.id||'';
 selectProject();
 if(state.selected)await loadRecords();
 message('단위사업 '+state.projects.length+'건 조회 · 계약과 비용은 초안만 관리합니다.','success');
}
function createRecordCard(item){
 const card=document.createElement('article');card.className='record';
 card.append(line('strong',item.title),line('small',item.record_date+' · '+item.kind+' · 초안'));
 if(item.note)card.append(line('p',item.note));
 const tags=line('small','수량 '+Number(item.quantity_kg||0).toLocaleString('ko-KR')+' kg · 입력금액 '+Number(item.amount_krw||0).toLocaleString('ko-KR')+'원');
 card.append(tags);
 if(item.counterparty)card.append(line('small','거래처 '+item.counterparty));
 return card;
}
async function loadRecords(){
 if(!state.selected)return;
 const kind=$('record-kind').value;
 const list=await call('/projects/'+encodeURIComponent(state.selected)+'/records?kind='+encodeURIComponent(kind));
 const node=$('record-list');clear(node);
 for(const rec of list.items||[])node.append(createRecordCard(rec));
 if(!(list.items||[]).length)node.append(line('p','아직 작성한 초안 기록이 없습니다.','empty'));
 const audit=await call('/projects/'+encodeURIComponent(state.selected)+'/audit');
 const trace=$('audit-list');clear(trace);
 for(const event of audit.items||[])trace.append(line('li',event.created_at+' · '+event.action+' · '+event.resource_id));
 if(!(audit.items||[]).length)trace.append(line('li','감사 이력이 없습니다.'));
}
async function execute(work){
 try{message('요청 확인 중');await work()}
 catch(e){if(e.status===401)lostAuth(e.message);else if(e.status===503){refreshVisibility(false);message(e.message,'error')}else message(e.message,'error')}
}
function init(){
 let token='';try{token=sessionStorage.getItem(TOKEN_KEY)||''}catch{}
 state.token=token;
 refreshVisibility(canView());
 $('connect').addEventListener('click',()=>execute(loadProjects));
 $('refresh').addEventListener('click',()=>execute(loadProjects));
 $('project-select').addEventListener('change',()=>{state.selected=$('project-select').value;$('record-form').hidden=!state.selected;execute(loadRecords)});
 $('record-kind').addEventListener('change',()=>execute(loadRecords));
 $('project-form').addEventListener('submit',event=>{event.preventDefault();execute(async()=>{
  const fd=new FormData(event.currentTarget);
  const project={name:String(fd.get('name')||''),region:String(fd.get('region')||''),greenhouseCount:Number(fd.get('greenhouseCount')),areaSqm:Number(fd.get('areaSqm'))};
  const created=await call('/projects','POST',project);state.selected=created.id;event.currentTarget.reset();await loadProjects();message('새 사업의 초안만 저장했습니다.','success');
 })});
 $('record-form').addEventListener('submit',event=>{event.preventDefault();execute(async()=>{
  if(!state.selected)throw new Error('단위사업을 먼저 선택해 주세요.');
  const fd=new FormData(event.currentTarget);
  const record={kind:$('record-kind').value,date:String(fd.get('date')||''),title:String(fd.get('title')||''),note:String(fd.get('note')||''),quantityKg:Number(fd.get('quantityKg')||0),amountKRW:Number(fd.get('amountKRW')||0),counterparty:String(fd.get('counterparty')||''),reference:String(fd.get('reference')||'')};
  await call('/projects/'+encodeURIComponent(state.selected)+'/records','POST',record);
  event.currentTarget.reset();$('record-date').value=new Date().toISOString().slice(0,10);await loadRecords();message('업무 초안 저장 완료 · 법적 계약이나 정산 승인이 아닙니다.','success');
 })});
 $('record-date').value=new Date().toISOString().slice(0,10);
 if(state.token)execute(loadProjects);else message('에코디 중앙 관리자 로그인 후 이 화면으로 돌아오세요.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();`;
