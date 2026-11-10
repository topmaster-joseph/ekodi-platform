(() => {
'use strict';
// Admin-only read-only view: brand protection and distributed site identities.
// The site owns its BI and local AI. This console never grants IP rights,
// changes brand graphics, or imports cross-tenant private data.
const SECTION='brand-governance';
const BASE='/admin/sites/brand-governance';
const PANEL_ID='ekodiBrandGovernance';
const VALID_TABS=new Set(['principles','sites','rights','activity']);
const LABELS={principles:'브랜드 원칙',sites:'사이트별 BI',rights:'권리·CI 자료',activity:'실행·검증'};
const SITES_EXTRA=[
  {id:'ekodi-root',name:'EKODI 플랫폼',url:'https://ekodi.kr/',status:'등록부 기준 확인 필요',category:'master'},
  {id:'bbqcg',name:'BBQ 무안청계점',url:'https://ekodi.kr/bbqcg',status:'사이트 운영상태 확인 필요',category:'partner'},
  {id:'cgma',name:'청계면상인회',url:'https://ekodi.kr/cgma',status:'사이트 운영상태 확인 필요',category:'partner'},
  {id:'cheonggye',name:'청계잇다',url:'https://ekodi.kr/cheonggye',status:'사이트 운영상태 확인 필요',category:'partner'},
  {id:'seonammedi',name:'서남권국립의대 시민소통센터',url:'https://ekodi.kr/seonammedi',status:'사이트 운영상태 확인 필요',category:'partner'}
];
const MARKS=Object.freeze([
  {name:'에코디',kind:'문자상표',state:'선행조사·출원 확인 전'},
  {name:'EKODI',kind:'문자상표',state:'선행조사·출원 확인 전'},
  {name:'에코디언',kind:'문자상표 후보',state:'권리·상품분류 검토 전'},
  {name:'EKODIAN',kind:'문자상표 후보',state:'권리·상품분류 검토 전'},
  {name:'EKODI 심벌',kind:'CI 시안 후보',state:'최종 승인·권리 확인 전'}
]);
const GITHUB_BASE='https://github.com/topmaster-joseph/ekodi-platform';
const LINKS=[
  {name:'브랜드·사이트 기획',href:GITHUB_BASE+'/blob/main/docs/brand/EKODI-SITE-BRAND-ROADMAP-20261110.md'},
  {name:'지식재산 보호 대장',href:GITHUB_BASE+'/blob/main/docs/brand/rights/ekodi-ip-registry.json'},
  {name:'상표 출원 준비서',href:GITHUB_BASE+'/blob/main/docs/brand/rights/EKODI-TRADEMARK-FILING-WORKSHEET.md'},
  {name:'사이트별 브랜드 사용규정 초안',href:GITHUB_BASE+'/blob/main/docs/brand/rights/EKODI-BRAND-USE-POLICY-DRAFT.md'},
  {name:'CI 제안 시안 (미승인)',href:GITHUB_BASE+'/pull/9183'}
];
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const plainPath=u=>{try{const x=new URL(u,'https://ekodi.kr');return x.hostname==='ekodi.kr'?x.pathname.replace(/\/$/,'')||'/':null}catch{return null}};
const safeHref=value=>{try{const url=new URL(value,location.origin);return url.protocol==='https:'?url.href:''}catch{return''}};
const isAdmin=()=>Boolean(document.querySelector('#app:not([hidden])') && sessionStorage.getItem('ekodi-auth-token'));
const tabFromLocation=()=>{const value=new URLSearchParams(location.search).get('tab')||'principles';return VALID_TABS.has(value)?value:'principles'};
let tab=tabFromLocation(),items=[],filter='',pending=false,loaded=false;
function panel(){return document.getElementById(PANEL_ID)}
function ensurePanel(){
  if(panel())return panel();
  const host=document.querySelector('#app .content, .content');
  if(!host)return null;
  const el=document.createElement('section');
  el.id=PANEL_ID;el.className='section brand-governance hidden-panel';el.dataset.panel=SECTION;el.hidden=true;
  el.innerHTML=`<div class="brand-g-head"><div><p class="kicker">BRAND · INDEPENDENT SITES</p><h2>브랜드·CI·권리 보호</h2><p>중앙은 요약과 기준을, 사이트는 고유 브랜드와 운영 책임을 맡습니다. 법적 등록·공식 승인으로 오인하지 않습니다.</p></div><a href="/admin/sites/sites-all" class="brand-g-link">전체 사이트</a></div>
  <nav class="brand-g-tabs" aria-label="브랜드 관리 세부메뉴"></nav>
  <div class="brand-g-content" data-brand-content role="region" aria-label="브랜드 관리 내용"></div>`;
  host.prepend(el);
  const nav=el.querySelector('.brand-g-tabs');
  for(const [key,label] of Object.entries(LABELS)){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.brandTab=key;button.addEventListener('click',()=>selectTab(key));nav.appendChild(button)}
  el.addEventListener('input',event=>{if(event.target.matches('[data-brand-search]')){filter=event.target.value;renderSites()}});
  return el;
}
function setActive(){
  const root=ensurePanel();if(!root)return;
  root.querySelectorAll('[data-brand-tab]').forEach(button=>{const active=button.dataset.brandTab===tab;button.setAttribute('aria-current',active?'page':'false');button.classList.toggle('is-current',active)});
}
function selectTab(key){
  if(!VALID_TABS.has(key))return;
  tab=key;
  const url=new URL(location.href);
  if(url.pathname===BASE) {url.searchParams.set('tab',tab);history.replaceState(null,'',url.pathname+url.search)}
  setActive();render();
}
function ownerModel(item){
 const path=plainPath(item.url)||'';
 if(item.category==='master'||path==='/')return ['마스터','에코디 가치·신뢰','플랫폼 자체 브랜드'];
 if(item.category==='partner'||['/bbqcg','/jadam','/pizzamaru','/yogurt'].includes(path))return ['고객·협력','원권리자 브랜드 우선','공통 기술은 계약에 따라 선택'];
 if(['/ekodichurch','/ekodimission','/bible'].includes(path))return ['사역·공동체','고유 사명·사이트 BI','독립된 운영 AI·권한'];
 return ['독립 서비스','사이트별 고객가치·BI','공통 기준은 기술·안전으로 제한'];
}
function adminPath(item){
 const path=plainPath(item.url);
 if(!path)return '';
 const roots=window.EKODICampus?.siteAdminRoots||[];
 return roots.find(x=>x.publicPath===path)?.adminPath||(
  path==='/bbqcg'?'/bbqcg/admin':''
 );
}
function normalized(raw){
 const id=String(raw.id||'').trim();
 const url=safeHref(raw.url);
 if(!id||!url)return null;
 return {id,name:String(raw.name||id),url,status:String(raw.status||'상태 확인 필요'),category:String(raw.category||'site'),source:String(raw.source||'registry')};
}
function dedupe(list){
 const map=new Map();
 for(const raw of list){const item=normalized(raw);if(!item)continue;const key=plainPath(item.url)||item.url;if(!map.has(key))map.set(key,item)}
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko-KR'));
}
async function loadSites(){
 if(pending)return;pending=true;
 try{
   // Already-published public catalog contains only service descriptions, not private tenant data.
   const response=await fetch('/ecosystem-services.json',{cache:'no-store',credentials:'same-origin'});
   const data=response.ok?await response.json():null;
   const services=Array.isArray(data?.services)?data.services.map(x=>({...x,source:'published-service-registry'})):[];
   if(!window.EKODICampus && window.EKODIAdminDemand?.activate) await window.EKODIAdminDemand.activate('campus');
   const customerSites=window.EKODICampus?.sitesForSection?.('sites-all')||[];
   const extra=customerSites.map(s=>({id:s.id||s.key,name:s.name,url:s.adminRoot?'https://ekodi.kr'+s.adminRoot.publicPath:s.url||'https://'+s.domain,status:s.lifecycle||'상태 확인 필요',category:s.group==='clients'?'partner':'site',source:'site-directory'}));
   // Registry availability is a declaration; only live HTTP or verified receipt proves production state.
   items=dedupe([...SITES_EXTRA,...services,...extra]);
   loaded=true;
 }catch(error){
   items=dedupe(SITES_EXTRA);loaded=false;
   const info=panel()?.querySelector('[data-brand-meta]');if(info)info.textContent='사이트 레지스트리 확인 필요';
 }finally{pending=false; if(tab==='sites')renderSites()}
}
function renderPrinciples(){
 const root=panel();if(!root)return;
 root.querySelector('[data-brand-content]').innerHTML=`<div class="brand-g-intro"><h3>각자의 자리에서, 함께 가능해지다</h3><p>에클레시아(모임) · 코이노니아(나눔) · 디아스포라(삶의 자리) · 희년(회복)은 에코디 설립 사명의 가치입니다. 이용자·고객·외부 가맹점에 정체성을 강제하지 않습니다.</p></div>
 <div class="brand-g-grid"><article><h3>마스터 EKODI</h3><p>ekodi.kr 생태계의 철학·신뢰·서비스 발견. 미승인 로고 변경이나 상표 등록 주장 없음.</p></article>
 <article><h3>공통 EKODI Core</h3><p>인증·권한·보안·감사·연동 계약. 브랜드 소유권과 사용자 데이터의 공동 소유를 의미하지 않음.</p></article>
 <article><h3>각 사이트의 독립 AI</h3><p>현장에 맞는 콘텐츠·운영·브랜딩을 해당 사이트 권한으로 실행하고, 중앙에 최소 요약만 보고.</p></article>
 <article><h3>원권리자 우선</h3><p>BBQ 등 고객·협력 사이트는 각자의 CI·가맹계약이 우선. 에코디 표지 강제·본사 정책 임의 변경 금지.</p></article></div>
 <p class="brand-g-note">전체 원칙은 최종 CI/법률 문서가 아니라 운영설계 기준입니다. 실제 법적 출원·계약·승인은 외부 절차로 별도 처리합니다.</p>`;
}
function renderSites(){
 const root=panel();if(!root||tab!=='sites')return;
 const host=root.querySelector('[data-brand-content]');
 const list=items.filter(x=>!filter||[x.name,x.url,x.id,ownerModel(x)[0]].join(' ').toLowerCase().includes(filter.toLowerCase()));
 if(!host.querySelector('[data-brand-search]')){
  host.innerHTML=`<div class="brand-g-controls"><label>사이트 검색 <input data-brand-search type="search" placeholder="서비스·사이트 이름 또는 주소" autocomplete="off"></label><button type="button" class="secondary" data-brand-refresh>목록 새로고침</button><small data-brand-meta role="status"></small></div><div data-brand-site-list class="brand-g-list"></div>`;
  host.querySelector('[data-brand-search]').value=filter;
  host.querySelector('[data-brand-refresh]').addEventListener('click',loadSites);
 }
 host.querySelector('[data-brand-meta]').textContent=`${list.length}개 표시 · ${loaded?'공개 서비스 레지스트리·사이트 원장 (실시간 법적 상태 아님)':'레지스트리 연결 확인 필요'}`;
 const target=host.querySelector('[data-brand-site-list]');
 if(!list.length){target.innerHTML='<p>해당 사이트가 없습니다. 레지스트리나 검색 조건을 확인하세요.</p>';return}
 target.innerHTML=list.map(s=>{
  const model=ownerModel(s),admin=adminPath(s),adminHref=admin?'https://ekodi.kr'+admin:'';
  return `<article class="brand-g-site"><div><p class="brand-g-type">${escapeHtml(model[0])} · ${escapeHtml(s.source)}</p><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(model[1])}</p><small>브랜드 적용: ${escapeHtml(model[2])} · 상태: ${escapeHtml(s.status)} (원장 표기)</small></div><div class="brand-g-actions"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">사이트 열기</a>${adminHref?`<a href="${escapeHtml(adminHref)}">해당 사이트 자세히</a>`:'<span>관리자 상세주소 확인 필요</span>'}</div></article>`;
 }).join('');
}
function renderRights(){
 panel().querySelector('[data-brand-content]').innerHTML=`<p class="brand-g-note">권리관리 기록은 내부 사전검토 상태입니다. 상표·로고·권리자 명의·출원번호는 확인 전이며 법적 등록이나 공식 가맹 승인을 뜻하지 않습니다.</p>
 <div class="brand-g-list">${MARKS.map(m=>`<article class="brand-g-mark"><div><b>${escapeHtml(m.name)}</b><span>${escapeHtml(m.kind)}</span></div><small>${escapeHtml(m.state)}</small></article>`).join('')}</div>
 <h3>관리 자료</h3><div class="brand-g-grid">${LINKS.map(x=>`<a class="brand-g-resource" href="${escapeHtml(x.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.name)}</a>`).join('')}</div>
 <p class="brand-g-note">법적 접수·납부·등록·상표권 양도·분쟁신고를 실행하는 버튼은 제공하지 않습니다.</p>`;
}
function renderActivity(){
 const root=panel();
 root.querySelector('[data-brand-content]').innerHTML=`<div class="brand-g-grid">
 <article><h3>BBQ 무안청계점</h3><p>QCS·GMS 고객 안내 및 빈 점검표 다운로드는 독립 매장 소스에 구현. 공개·다운로드 실제 응답은 별도 실서비스 검증 결과를 확인합니다.</p><a href="https://ekodi.kr/bbqcg/service-guide" target="_blank" rel="noopener noreferrer">고객 안내·자료실</a></article>
 <article><h3>EKODI 브랜드 보호</h3><p>상표 대장·원본증빙·출원 준비표의 법적 상태를 기록. KIPRIS 개별 조사·출원은 미완료.</p><a href="${GITHUB_BASE}/issues/9198" target="_blank" rel="noopener noreferrer">보호 업무 기록</a></article>
 <article><h3>각 사이트의 독립 AI</h3><p>중앙은 요약과 해당 사이트 상세 연결만 제공합니다. 실제 사이트의 승인·기록·홍보는 로컬 관리자 권한으로 관리합니다.</p><a href="/admin/sites/sites-all">전체 사이트 상세 보기</a></article>
 <article><h3>독립 CI 시안</h3><p>심벌·상표권·원본은 확정 전입니다. 사용 허락이 없는 고객·파트너 로고를 바꾸지 않습니다.</p><a href="${GITHUB_BASE}/pull/9183" target="_blank" rel="noopener noreferrer">CI 시안 검토</a></article></div>`;
}
function render(){
 const root=ensurePanel();if(!root)return;
 setActive();
 if(tab==='principles')renderPrinciples();
 else if(tab==='sites'){root.querySelector('[data-brand-content]').innerHTML='';renderSites();if(!loaded&&!pending)loadSites();}
 else if(tab==='rights')renderRights();
 else renderActivity();
}
function install(){
 if(!isAdmin())return;
 if(ensurePanel())render();
 const button=document.querySelector('.sidebar nav [data-section="brand-governance"]');
 if(button&&!button.dataset.brandGovernanceBound){button.dataset.brandGovernanceBound='1';button.addEventListener('click',()=>{window.EKODIAdminPanels?.activate?.(SECTION);render()})}
 if(location.pathname===BASE){tab=tabFromLocation();render()}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.addEventListener('ekodi-admin-ready',install);
window.addEventListener('ekodi-nav-changed',install);
window.EKODIBrandGovernance=Object.freeze({section:SECTION,refresh:loadSites,getCount:()=>items.length,legalActionsEnabled:false});
})();