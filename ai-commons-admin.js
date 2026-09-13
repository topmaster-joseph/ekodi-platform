(() => {
'use strict';
const TOKEN_KEY='ekodi-auth-token';
const API='/ai/api/commons/admin';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}};
const headers=()=>token()?{authorization:`Bearer ${token()}`,accept:'application/json'}:{accept:'application/json'};
const status=value=>({submitted:'요청접수',reuse_suggested:'검토중',triaged:'검토중',candidate:'개발중',sandboxed:'테스트중',verified:'검증완료',staged:'공개준비중',shared:'사용가능',rejected:'거절'})[value]||value;
const decision=value=>({publish:'공개',hold:'보류',reject:'거절'})[value]||'결정대기';
async function api(path,options={}){
  const h={...headers(),...(options.headers||{})};if(options.body)h['content-type']='application/json';
  const response=await fetch(`${API}${path}`,{...options,headers:h,cache:'no-store'});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status});return data;
}
function host(){return document.querySelector('#commonServiceDetail')}
function section(){return document.getElementById('aiCommonsGovernance')}
function mount(){
  const target=host();if(!target)return null;let root=section();if(root)return root;
  root=document.createElement('section');root.id='aiCommonsGovernance';root.className='ai-runtime-block';
  root.innerHTML=`<div class="common-subhead"><div><small>AI COMMONS · FINAL GATE</small><h4>모두의 AI 공개심사</h4></div><button type="button" class="ghost" data-commons-refresh>↻</button></div>
    <p class="common-policy-note">에코디 AI가 요청접수 → 검토중 → 개발중 → 테스트중 → 검증완료 → 공개준비중 상태를 자동 관리합니다. 최고관리자는 최종 공개·보류·거절만 결정합니다.</p>
    <div data-commons-status class="common-inline-status">공개심사 요청을 확인하는 중입니다.</div>
    <div data-commons-requests class="ai-task-list"></div>`;
  target.append(root);root.querySelector('[data-commons-refresh]')?.addEventListener('click',load);return root;
}
function actions(item){
  if(item.status==='shared')return'<span>공개 완료</span>';
  if(item.status==='rejected')return'<span>거절됨</span>';
  if(item.status!=='staged')return'<span>AI 자동 진행중</span>';
  return `<button type="button" data-decision="publish">공개</button><button type="button" data-decision="hold">보류</button><button type="button" data-decision="reject">거절</button>`;
}
function row(item){
  const finalDecision=decision(item.reviewDecision);
  return `<article class="ai-task-row" data-request="${esc(item.fingerprint)}"><div><strong>${esc(item.title||item.outcome)}</strong><small>AI 진행: ${esc(status(item.status))} · 최고관리자: ${esc(finalDecision)} · ${Number(item.requestCount||1)}명 요청${sourceText}${item.developmentTaskId?` · ${esc(item.developmentTaskId)}`:''}</small></div><div class="common-detail-actions">${actions(item)}</div></article>`;
}
async function decide(fingerprint,decision){
  const root=section();const statusNode=root?.querySelector('[data-commons-status]');if(statusNode)statusNode.textContent='최고관리자 결정을 반영하는 중입니다.';
  try{await api(`/requests/${encodeURIComponent(fingerprint)}/decision`,{method:'POST',body:JSON.stringify({decision})});await load()}
  catch(error){if(statusNode)statusNode.textContent=`결정 반영 실패: ${error.message}`}
}
function bindDecisions(root){
  root.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',()=>{
    const request=button.closest('[data-request]');if(request?.dataset.request)void decide(request.dataset.request,button.dataset.decision);
  }));
}
async function load(){
  const root=mount();if(!root)return;const statusNode=root.querySelector('[data-commons-status]');const list=root.querySelector('[data-commons-requests]');
  try{const data=await api('/requests');const items=data.requests||[];statusNode.textContent=`최고관리자 최종 공개 권한 · ${items.length}건`;
    list.innerHTML=items.length?items.map(row).join(''):'<p class="common-empty">현재 공개심사 요청이 없습니다.</p>';bindDecisions(root);
  }catch(error){list.replaceChildren();statusNode.textContent=error.status===403?'최고관리자만 공개 여부를 결정할 수 있습니다.':`공개심사 조회 실패: ${error.message}`;}
}
window.addEventListener('ekodi-common-services-rendered',event=>{if(event.detail?.service==='ai')void load()});
})();
