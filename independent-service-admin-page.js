import { ADMIN_SERVICE_CATALOG, canonicalServiceAdminPath, canonicalServiceUrl } from './admin-service-catalog.js';

const GENERIC_SERVICE_ADMIN_IDS=new Set(['bible','social','cafe','money','pay','books','publishing','journal','lab','education','work','insurance','messenger','cloud','media']);
const SERVICE_PROFILES=Object.freeze({
  bible:[['overview','대시보드'],['content','말씀·콘텐츠'],['members','참여자'],['channels','채널·소통'],['automation','자동운영'],['settings','설정']],
  social:[['overview','대시보드'],['channels','채널'],['content','콘텐츠'],['members','계정·권한'],['automation','자동게시'],['records','성과·기록'],['settings','설정']],
  cafe:[['overview','대시보드'],['operations','매장·운영'],['customers','고객·예약'],['content','행사·콘텐츠'],['automation','자동운영'],['records','운영기록'],['settings','설정']],
  money:[['overview','대시보드'],['finance','계좌·재무'],['operations','정리·업무'],['records','기록·보고'],['automation','자동점검'],['settings','설정']],
  pay:[['overview','대시보드'],['operations','결제·거래'],['finance','정산'],['connections','PG·연동'],['automation','자동처리'],['records','감사기록'],['settings','설정']],
  books:[['overview','대시보드'],['catalog','도서·상품'],['operations','주문·판매'],['publishing','출판·유통'],['channels','판매채널'],['automation','자동운영'],['settings','설정']],
  publishing:[['overview','대시보드'],['projects','출판 프로젝트'],['content','원고·콘텐츠'],['members','저자·담당자'],['publishing','제작·유통'],['automation','자동운영'],['records','진행·기록'],['settings','설정']],
  journal:[['overview','대시보드'],['content','편집·콘텐츠'],['publishing','발행·아카이브'],['channels','배포채널'],['automation','자동발행'],['records','성과·기록'],['settings','설정']],
  lab:[['overview','대시보드'],['projects','연구과제'],['content','자료·데이터'],['members','연구자·권한'],['publishing','논문·성과'],['automation','자동운영'],['records','연구기록'],['settings','설정']],
  education:[['overview','대시보드'],['catalog','과정·프로그램'],['members','학습자·강사'],['content','교육콘텐츠'],['operations','신청·운영'],['automation','자동운영'],['records','성과·기록'],['settings','설정']],
  work:[['overview','대시보드'],['catalog','채용·일감'],['customers','기업·의뢰처'],['members','구직자·인재'],['operations','매칭·업무'],['automation','자동매칭'],['records','성과·기록'],['settings','설정']],
  insurance:[['overview','대시보드'],['customers','고객·문의'],['catalog','보험정보'],['operations','상담·업무'],['records','계약·기록'],['automation','자동후속'],['settings','설정']],
  messenger:[['overview','대시보드'],['connections','계정·연결'],['channels','채널'],['content','메시지·템플릿'],['automation','자동응답'],['records','전송기록'],['settings','설정']],
  cloud:[['overview','대시보드'],['content','파일·자료'],['members','사용자·권한'],['connections','저장소·연동'],['automation','자동정리'],['records','변경기록'],['settings','설정']],
  media:[['overview','대시보드'],['content','미디어'],['channels','채널·배포'],['operations','제작·라이브'],['automation','자동게시'],['records','성과·기록'],['settings','설정']]
});
const PROFILE_BY_GROUP=Object.freeze({
  business:[['overview','대시보드'],['operations','운영'],['customers','고객·거래'],['channels','채널·연동'],['automation','자동운영'],['finance','정산·재무'],['settings','설정']],
  community:[['overview','대시보드'],['content','콘텐츠'],['members','회원·참여'],['channels','채널·소통'],['automation','자동운영'],['settings','설정']],
  knowledge:[['overview','대시보드'],['content','콘텐츠·자료'],['publishing','발행·유통'],['channels','채널·연동'],['automation','자동운영'],['settings','설정']],
  professional:[['overview','대시보드'],['operations','업무'],['members','사용자·권한'],['automation','자동운영'],['records','기록·보고'],['settings','설정']],
  public:[['overview','대시보드'],['connections','연결·계정'],['content','콘텐츠·운영'],['channels','채널·연동'],['automation','자동운영'],['settings','설정']]
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
  settings:'사이트 디자인·언어·공통 설정을 관리합니다.',
  automation:'반복 업무·콘텐츠·알림·채널 작업의 자동운영 정책과 상태를 관리합니다.',
  catalog:'서비스의 상품·과정·항목 원장을 관리합니다.',
  projects:'프로젝트와 진행상태를 관리합니다.'
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
      const menu=SERVICE_PROFILES[item.id]||PROFILE_BY_GROUP[item.group]||PROFILE_BY_GROUP.public;
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
  const controlLinks={
    automation:`/admin/settings-records/ai-settings?site=${encodeURIComponent(d.id)}`,
    channels:`/admin/content/social?site=${encodeURIComponent(d.id)}`,
    members:`/admin/people/users-access?site=${encodeURIComponent(d.id)}`,
    settings:`/admin/settings-records/public-site-controls?site=${encodeURIComponent(d.id)}`,
    records:`/admin/settings-records/audit-records?site=${encodeURIComponent(d.id)}`,
    connections:`/admin/settings-records/ai-module-spec?site=${encodeURIComponent(d.id)}`,
    finance:`/admin/content/finance?site=${encodeURIComponent(d.id)}`,
    publishing:`/admin/content/books?site=${encodeURIComponent(d.id)}`
  };
  const controlHref=controlLinks[section]||'/admin/services/engine-all?site='+encodeURIComponent(d.id);
  const quick=`<div class="quick"><a href="${e(d.adminPath+'/automation')}"><b>자동운영</b><span>반복업무·게시·후속작업 정책</span></a><a href="/admin/status/health?site=${e(d.id)}"><b>운영상태</b><span>장애·응답·배포상태 확인</span></a><a href="/admin/people/users-access?site=${e(d.id)}"><b>권한</b><span>관리자·담당자 접근관리</span></a><a href="/admin/status/deployments?site=${e(d.id)}"><b>배포</b><span>배포·작업대기 확인</span></a></div>`;
  const body=section==='overview'
    ?`<div class="metrics"><article><small>사용자 페이지</small><strong>${e(d.basePath)}</strong></article><article><small>관리자 페이지</small><strong>${e(d.adminPath)}</strong></article><article><small>운영구분</small><strong>독립 운영</strong></article></div>${quick}<section class="panel"><h2>오늘 운영</h2><p>${e(d.name)}의 핵심 업무, 자동운영, 권한, 배포상태를 이 관리자에서 확인합니다. 실제 업무 데이터는 서비스별 모듈과 공통 엔진을 연결해 사용합니다.</p><div class="actions"><a href="${e(publicUrl)}" target="_blank" rel="noopener">사용자 화면 열기</a><a href="${e(d.adminPath+'/automation')}">자동운영 설정</a><a href="/admin/sites/sites-all">최고관리자 사이트관리</a></div></section>`
    :section==='automation'
      ?`<section class="panel"><h2>자동운영</h2><p>자동게시·반복업무·알림·후속작업은 공통 EKODI 자동화 엔진을 사용하되, 대상과 권한은 ${e(d.name)} 범위로 제한합니다.</p><div class="ops-grid"><article><b>1. 자동화 정책</b><span>실행 가능 범위·빈도·승인조건</span></article><article><b>2. 채널 연결</b><span>게시·메시지·외부계정 연결</span></article><article><b>3. 운영상태</b><span>실패·재시도·장애 확인</span></article><article><b>4. 감사기록</b><span>자동 실행 결과와 변경이력</span></article></div><div class="actions"><a href="/admin/settings-records/ai-settings?site=${e(d.id)}">AI·자동화 정책</a><a href="/admin/content/social?site=${e(d.id)}">채널·자동게시</a><a href="/admin/status/health?site=${e(d.id)}">운영상태</a><a href="/admin/settings-records/audit-records?site=${e(d.id)}">감사기록</a></div><p class="note">자동운영은 실제 연결·권한·검증이 완료된 기능만 실행하며, 연결되지 않은 기능을 성공으로 표시하지 않습니다.</p></section>`
      :`<section class="panel"><h2>${e(title)}</h2><p>${e(COPY[section]||'서비스 전용 관리 영역입니다.')}</p><div class="ops-grid"><article><b>업무 범위</b><span>${e(d.name)} 전용</span></article><article><b>권한</b><span>서비스 관리자·담당자 기준</span></article><article><b>자동운영</b><span>공통 엔진 연결 가능</span></article><article><b>기록</b><span>변경·실행 이력 보존</span></article></div><p class="note">실제 데이터 변경은 해당 서비스 권한과 공통 API의 인증을 통과한 경우에만 수행됩니다.</p><div class="actions"><a href="${e(controlHref)}">이 기능 관리</a><a href="${e(d.adminPath+'/automation')}">자동운영</a><a href="${e(publicUrl)}" target="_blank" rel="noopener">사용자 화면</a></div></section>`;
  return new Response(`<!doctype html><html lang="ko" data-ekodi-service-admin="${e(d.id)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(title)} · ${e(d.name)} 관리자</title><style>:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}.layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh}.side{background:#fff;border-right:1px solid #e5e9f0;padding:18px 14px}.side h1{font-size:16px;margin:0 0 4px}.side p{font-size:11px;color:#7d8796;margin:0 0 16px}.side nav{display:grid;gap:4px}.side nav a{padding:9px 10px;border-radius:8px;color:#4b5563;text-decoration:none;font-size:13px}.side nav a.active,.side nav a:hover{background:#eef3ff;color:#1f3c88;font-weight:700}.main{padding:24px;max-width:1180px}.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.head h2{margin:0;font-size:24px}.head p{margin:5px 0 0;color:#6b7280;font-size:13px}.badge{padding:6px 9px;border:1px solid #dce3ee;border-radius:999px;background:#fff;font-size:11px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.quick,.ops-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.quick a,.ops-grid article{display:grid;gap:4px;background:#fff;border:1px solid #e6eaf1;border-radius:12px;padding:12px;text-decoration:none;color:inherit}.quick a:hover{border-color:#bcc9de;background:#fbfcff}.quick b,.ops-grid b{font-size:13px}.quick span,.ops-grid span{font-size:11px;color:#7d8796;line-height:1.45}.metrics article,.panel{background:#fff;border:1px solid #e6eaf1;border-radius:12px;padding:14px}.metrics small{display:block;color:#7d8796;font-size:11px}.metrics strong{display:block;margin-top:5px;font-size:16px}.panel h2{font-size:16px;margin:0 0 8px}.panel p{font-size:13px;color:#667085;line-height:1.6}.note{padding:10px;border-radius:9px;background:#f7f9fc}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions a{display:inline-flex;padding:8px 10px;border:1px solid #dce3ee;border-radius:8px;text-decoration:none;color:#334155;font-size:12px}@media(max-width:760px){.layout{display:block}.side{border-right:0;border-bottom:1px solid #e5e9f0;padding:10px 12px}.side h1,.side p{display:none}.side nav{display:flex;overflow:auto}.side nav a{white-space:nowrap}.main{padding:14px 12px}.metrics,.quick,.ops-grid{grid-template-columns:1fr}.head{display:grid}}</style></head><body><div class="layout"><aside class="side"><h1>${e(d.name)}</h1><p>독립 관리자</p><nav>${nav}</nav></aside><main class="main"><header class="head"><div><h2>${e(title)}</h2><p>${e(COPY[section]||'서비스 전용 관리 영역')}</p></div><span class="badge">서비스 관리자</span></header>${body}</main></div></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'x-ekodi-route':'independent-service-admin','x-ekodi-service-admin':d.id}});
}
