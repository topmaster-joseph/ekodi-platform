(()=>{
'use strict';
const SECTION='personal-finance';
const API='https://personal-finance-api.ekodi.kr/api/admin/personal-finance/control';
const TOKEN_KEY='ekodi-auth-token';
let state=null,busy=false;
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}};
const t=(ko,en)=>String(window.EKODIAdminMenu?.locale?.()||document.documentElement.lang||'ko').toLowerCase().startsWith('en')?en:ko;
function date(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'})}
async function request(method='GET',body=null){
  const response=await fetch(API,{method,cache:'no-store',headers:{authorization:`Bearer ${token()}`,accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||`Personal Finance control ${response.status}`);error.code=data.code||'';error.status=response.status;throw error}
  return data;
}
function badge(ok,yes,no){return `<span class="pf-admin-badge ${ok?'ok':'locked'}">${esc(ok?yes:no)}</span>`}
function settingRow(key,label,copy,value,disabled=false){return `<label class="pf-admin-setting"><span><strong>${esc(label)}</strong><small>${esc(copy)}</small></span><input type="checkbox" name="${esc(key)}" ${value?'checked':''} ${disabled?'disabled':''}></label>`}
function render(){
  const host=$('#personalFinanceAdminPanel');if(!host||!state)return;
  const c=state.config||{},s=state.safety||{},schema=state.schema||{},admin=state.admin||{},privacy=state.privacy||{};
  host.innerHTML=`<div class="pf-admin-head"><div><p class="kicker">전문서비스 · PERSONAL FINANCE</p><h2>개인재무 운영 설정</h2><p>개인 금융원장의 내용은 이 화면에서 조회하지 않습니다. 서비스 상태·기능 경계·안전정책만 관리합니다.</p></div><div class="pf-admin-actions"><a class="secondary" href="https://my.ekodi.kr/#money" target="_blank" rel="noopener">My EKODI 열기 ↗</a><button id="pfAdminRefresh" class="secondary" type="button">↻ 새로고침</button></div></div>
  <div class="pf-admin-summary"><article><small>서비스</small><strong>${c.serviceEnabled?'운영 중':'일시 중지'}</strong><span>전용 D1 · Person Scope</span></article><article><small>Runtime</small><strong>v${esc(state.service?.runtimeVersion||3)}</strong><span>${esc(schema.latestMigration||'migration 확인')}</span></article><article><small>행동 상한</small><strong>${esc(s.actionCeiling||'L2')}</strong><span>Recommend only</span></article><article><small>관리자 원장 열람</small><strong>차단</strong><span>운영정책만 조회</span></article></div>
  <div class="pf-admin-grid"><section class="pf-admin-card"><div class="pf-admin-subhead"><div><small>SERVICE FEATURES</small><h3>사용 기능</h3></div>${badge(admin.canWrite,'변경 가능','조회 전용')}</div><form id="pfAdminSettings">${settingRow('serviceEnabled','서비스 사용','My EKODI의 개인재무 API 전체 사용 여부',c.serviceEnabled,!admin.canWrite)}${settingRow('manualEntryEnabled','수동 입력','계좌·거래 직접 입력 허용',c.manualEntryEnabled,!admin.canWrite)}${settingRow('fileImportEnabled','파일 가져오기','CSV·Excel Preview → Commit 허용',c.fileImportEnabled,!admin.canWrite)}${settingRow('planningEnabled','계획 엔진','반복지출·예산·목표·안전사용가능액',c.planningEnabled,!admin.canWrite)}<div class="pf-admin-save"><span id="pfAdminSaveState">최근 변경 ${date(c.updatedAt)}</span><button class="primary" type="submit" ${admin.canWrite?'':'disabled'}>운영 설정 저장</button></div></form></section>
  <section class="pf-admin-card"><div class="pf-admin-subhead"><div><small>IMMUTABLE SAFETY</small><h3>안전 잠금</h3></div>${badge(true,'강제 적용','')}</div><div class="pf-admin-locks"><article><span>AI 쓰기</span><strong>OFF</strong></article><article><span>금융 실행</span><strong>OFF</strong></article><article><span>외부 금융 Connector</span><strong>${esc(s.externalFinancialConnectors||'LOCKED')}</strong></article><article><span>예상수입 선사용</span><strong>금지</strong></article><article><span>전체 계좌번호 저장</span><strong>금지</strong></article><article><span>개인 원장 Admin 열람</span><strong>차단</strong></article></div></section></div>
  <div class="pf-admin-grid"><section class="pf-admin-card"><div class="pf-admin-subhead"><div><small>BOUNDARY</small><h3>데이터 · 인증 경계</h3></div></div><dl class="pf-admin-kv"><div><dt>사용자 진입</dt><dd>my.ekodi.kr/#money</dd></div><div><dt>데이터 경계</dt><dd>${esc(state.service?.dataBoundary||'dedicated-d1')}</dd></div><div><dt>원장 소유권</dt><dd>${esc(privacy.ledgerOwnerScope||'person')}</dd></div><div><dt>원본 가져오기 파일</dt><dd>${privacy.rawImportFileRetention==='none'?'보관하지 않음':esc(privacy.rawImportFileRetention)}</dd></div><div><dt>관리자 권한</dt><dd>${esc(admin.role||'viewer')}${admin.canWrite?' · Google 추가인증 후 변경':''}</dd></div></dl></section>
  <section class="pf-admin-card"><div class="pf-admin-subhead"><div><small>REALITY CHECK</small><h3>구축 상태</h3></div></div><dl class="pf-admin-kv"><div><dt>서비스 API</dt><dd>personal-finance-api.ekodi.kr</dd></div><div><dt>Schema</dt><dd>${schema.migrationCount==null?'확인 필요':`${schema.migrationCount} migrations`} · control v${esc(schema.serviceControlSchema||1)}</dd></div><div><dt>Personal Finance Core</dt><dd>전용 D1</dd></div><div><dt>안전사용가능액</dt><dd>Deterministic P1</dd></div></dl><p class="pf-admin-note">이 화면은 개인별 계좌·거래·잔액·목표 데이터를 요청하는 API를 사용하지 않습니다.</p></section></div>`;
  $('#pfAdminRefresh')?.addEventListener('click',()=>refresh(true));$('#pfAdminSettings')?.addEventListener('submit',save);
}
async function save(event){
  event.preventDefault();if(busy||!state?.admin?.canWrite)return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),status=$('#pfAdminSaveState');
  const payload={serviceEnabled:form.elements.serviceEnabled.checked,manualEntryEnabled:form.elements.manualEntryEnabled.checked,fileImportEnabled:form.elements.fileImportEnabled.checked,planningEnabled:form.elements.planningEnabled.checked};
  busy=true;if(button)button.disabled=true;if(status)status.textContent='보호된 설정 확인 중…';
  try{
    try{state=await request('PUT',payload)}catch(error){if(error.code!=='ELEVATION_REQUIRED')throw error;await window.EKODIAdminContext?.elevate?.();state=await request('PUT',payload)}
    render();const next=$('#pfAdminSaveState');if(next)next.textContent='운영 설정이 저장되었습니다.';
  }catch(error){if(status)status.textContent=error.message;console.error('[Personal Finance Admin]',error)}finally{busy=false;if(button?.isConnected)button.disabled=false}
}
async function refresh(force=false){
  const host=$('#personalFinanceAdminPanel');if(!host||busy)return;
  busy=true;if(force)host.dataset.refreshing='true';
  try{state=await request('GET');render()}catch(error){host.innerHTML=`<div class="pf-admin-error"><strong>개인재무 운영 상태를 불러오지 못했습니다.</strong><p>${esc(error.message)}</p><button id="pfAdminRetry" class="secondary" type="button">다시 확인</button></div>`;$('#pfAdminRetry')?.addEventListener('click',()=>refresh(true))}finally{busy=false;delete host.dataset.refreshing}
}
function activate(button,section){
  document.querySelectorAll('[data-panel]').forEach(panel=>{const visible=String(panel.dataset.panel||'').split(/\s+/).includes(SECTION);panel.hidden=!visible;panel.classList.toggle('hidden-panel',!visible)});
  document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item===button));
  const title=$('#pageTitle');if(title)title.textContent=t('개인재무','Personal Finance');document.querySelector('.sidebar')?.classList.remove('open');
  if(location.hash!=='#personal-finance')history.replaceState(null,'','#personal-finance');void refresh();
}
function install(){
  const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content');if(!nav||!content)return;
  let button=nav.querySelector('[data-section="personal-finance"],[data-lazy-section="personal-finance"],[data-demand-feature="personal-finance"]');
  if(!button){button=document.createElement('button');button.type='button';button.className='nav';button.append(document.createTextNode('₩ '),Object.assign(document.createElement('span'),{textContent:t('개인재무','Personal Finance')}));nav.append(button)}
  button.dataset.section=SECTION;delete button.dataset.lazySection;delete button.dataset.demandFeature;
  let section=$('#personalFinanceAdminPanel');if(!section){section=document.createElement('section');section.id='personalFinanceAdminPanel';section.className='section personal-finance-admin hidden-panel';section.dataset.panel=SECTION;section.hidden=true;content.append(section)}
  if(button.dataset.pfAdminBound!=='true'){button.dataset.pfAdminBound='true';button.addEventListener('click',()=>activate(button,section))}
  window.dispatchEvent(new CustomEvent('ekodi-nav-changed',{detail:{feature:SECTION}}));
  if(location.hash==='#personal-finance')queueMicrotask(()=>activate(button,section));
}
install();window.addEventListener('ekodi-admin-ready',install);window.addEventListener('ekodi-admin-locale-changed',()=>{if(state&&$('#personalFinanceAdminPanel:not(.hidden-panel)'))render()});
window.EKODIPersonalFinanceAdmin=Object.freeze({refresh});
})();
