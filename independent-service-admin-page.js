import { ADMIN_SERVICE_CATALOG, canonicalServiceAdminPath, canonicalServiceUrl } from './admin-service-catalog.js';

const GENERIC_SERVICE_ADMIN_IDS=new Set(['bible','social','cafe','money','pay','books','publishing','journal','lab','education','work','insurance','messenger','cloud','media']);
const PROFILE_BY_GROUP=Object.freeze({
  business:[['overview','대시보드'],['operations','운영'],['customers','고객·거래'],['channels','채널·연동'],['finance','정산·재무'],['settings','설정']],
  community:[['overview','대시보드'],['content','콘텐츠'],['members','회원·참여'],['channels','채널·소통'],['settings','설정']],
  knowledge:[['overview','대시보드'],['content','콘텐츠·자료'],['publishing','발행·유통'],['channels','채널·연동'],['settings','설정']],
  professional:[['overview','대시보드'],['operations','업무'],['members','사용자·권한'],['records','기록·보고'],['settings','설정']],
  public:[['overview','대시보드'],['connections','연결·계정'],['content','콘텐츠·운영'],['channels','채널·연동'],['settings','설정']]
});
const COPY=Object.freeze({
  overview:'이 서비스의 운영 상태와 필요한 작업을 확인합니다.',
  operations:'서비스 고유 업무를 처리합니다.',
  customers:'고객·거래 관련 업무를 서비스 범위에서 관리합니다.',
  channels:'외부 계정과 게시·연동 채널을 관리합니다.',
  finance:'정산·재무 기능은 공통 Finance 엔진과 연결합니다.',
  content:'이 서비스의 콘텐츠와 자료를 관리합니다.',
  members:'사용자·회원·관리자 권한을 서비스 범위에서 관리합니다.',
  publishing:'발행·출판·유통 흐름을 서비스 범위에서 관리합니다.',
  records:'운영 기록과 보고서를 확인합니다.',
  connections:'서비스 계정·외부 연결 상태를 관리합니다.',
  settings:'사이트 디자인·언어·공통 설정을 관리합니다.'
});
function normalize(path){const p=String(path||'').replace(/\/+$/,'')||'/';return p}
export function independentServiceAdminDescriptor(pathname){
  const path=normalize(pathname);
  for(const item of ADMIN_SERVICE_CATALOG){
    if(!GENERIC_SERVICE_ADMIN_IDS.has(item.id))continue;
    const root=canonicalServiceAdminPath(item.basePath);
    if(path===root||path.startsWith(root+'/')){
      const rest=path.slice(root.length).replace(/^\/+|\/+$/g,'');
      const section=(rest.split('/')[0]||'overview').toLowerCase();
      const menu=PROFILE_BY_GROUP[item.group]||PROFILE_BY_GROUP.public;
      return Object.freeze({...item,adminPath:root,section,menu});
    }
  }
  return null;
}
function e(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function independentServiceAdminPage(pathname){
  const d=independentServiceAdminDescriptor(pathname);if(!d)return null;
  const publicUrl=canonicalServiceUrl(d.basePath), valid=new Set(d.menu.map(x=>x[0])),section=valid.has(d.section)?d.section:'overview';
  const title=d.menu.find(x=>x[0]===section)?.[1]||'대시보드';
  const nav=d.menu.map(([id,label])=>`<a href="${e(d.adminPath+(id==='overview'?'':'/'+id))}" ${id===section?'aria-current="page" class="active"':''}>${e(label)}</a>`).join('');
  const body=section==='overview'
    ?`<div class="metrics"><article><small>사용자 페이지</small><strong>${e(d.basePath)}</strong></article><article><small>관리자 페이지</small><strong>${e(d.adminPath)}</strong></article><article><small>운영구분</small><strong>독립 서비스</strong></article></div><section class="panel"><h2>${e(d.name)} 운영</h2><p>사용자 화면과 관리자 화면을 분리하고, 공통 인증·권한·언어·디자인·연동 엔진만 공유합니다.</p><div class="actions"><a href="${e(publicUrl)}" target="_blank" rel="noopener">사용자 화면 열기</a><a href="/admin/sites/sites-all">최고관리자 사이트관리</a></div></section>`
    :`<section class="panel"><h2>${e(title)}</h2><p>${e(COPY[section]||'서비스 전용 관리 영역입니다.')}</p><p class="note">실제 데이터 변경은 해당 서비스 권한과 공통 API의 인증을 통과한 경우에만 수행됩니다.</p><div class="actions"><a href="${e(publicUrl)}" target="_blank" rel="noopener">사용자 화면</a><a href="/admin/sites/sites-all">최고관리자 사이트관리</a></div></section>`;
  return new Response(`<!doctype html><html lang="ko" data-ekodi-service-admin="${e(d.id)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(title)} · ${e(d.name)} 관리자</title><style>:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}.layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh}.side{background:#fff;border-right:1px solid #e5e9f0;padding:18px 14px}.side h1{font-size:16px;margin:0 0 4px}.side p{font-size:11px;color:#7d8796;margin:0 0 16px}.side nav{display:grid;gap:4px}.side nav a{padding:9px 10px;border-radius:8px;color:#4b5563;text-decoration:none;font-size:13px}.side nav a.active,.side nav a:hover{background:#eef3ff;color:#1f3c88;font-weight:700}.main{padding:24px;max-width:1180px}.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.head h2{margin:0;font-size:24px}.head p{margin:5px 0 0;color:#6b7280;font-size:13px}.badge{padding:6px 9px;border:1px solid #dce3ee;border-radius:999px;background:#fff;font-size:11px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.metrics article,.panel{background:#fff;border:1px solid #e6eaf1;border-radius:12px;padding:14px}.metrics small{display:block;color:#7d8796;font-size:11px}.metrics strong{display:block;margin-top:5px;font-size:16px}.panel h2{font-size:16px;margin:0 0 8px}.panel p{font-size:13px;color:#667085;line-height:1.6}.note{padding:10px;border-radius:9px;background:#f7f9fc}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions a{display:inline-flex;padding:8px 10px;border:1px solid #dce3ee;border-radius:8px;text-decoration:none;color:#334155;font-size:12px}@media(max-width:760px){.layout{display:block}.side{border-right:0;border-bottom:1px solid #e5e9f0;padding:10px 12px}.side h1,.side p{display:none}.side nav{display:flex;overflow:auto}.side nav a{white-space:nowrap}.main{padding:14px 12px}.metrics{grid-template-columns:1fr}.head{display:grid}}</style></head><body><div class="layout"><aside class="side"><h1>${e(d.name)}</h1><p>독립 관리자</p><nav>${nav}</nav></aside><main class="main"><header class="head"><div><h2>${e(title)}</h2><p>${e(COPY[section]||'서비스 전용 관리 영역')}</p></div><span class="badge">서비스 관리자</span></header>${body}</main></div></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'x-ekodi-route':'independent-service-admin','x-ekodi-service-admin':d.id}});
}
