// Read-only, tenant-local presentation of existing authenticated marketing data.
// This module does not acquire platform authority or trigger publishing.
export const TENANT_AUTOMATION_CSS = `
.tenant-auto-overview{display:grid;gap:12px;padding:16px;border:1px solid #d8e2f0;border-radius:12px;background:#fff;min-width:0}
.tenant-auto-overview>header{display:grid;gap:4px}
.tenant-auto-overview>header h2{margin:0;font-size:18px}
.tenant-auto-overview>header p,.tenant-auto-overview .tenant-auto-note{margin:0;color:#596a7d;font-size:12px;line-height:1.6;word-break:keep-all}
.tenant-auto-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tenant-auto-summary article{padding:12px;min-width:0;background:#f5f8fc;border:1px solid #e3eaf3;border-radius:9px}
.tenant-auto-summary small{display:block;font-size:12px;color:#58687d}
.tenant-auto-summary strong{display:block;margin-top:5px;font-size:19px;color:#153d70}
.tenant-auto-tabs{display:flex;gap:6px;flex-wrap:wrap;max-width:100%}
.tenant-auto-tabs button{font:inherit;font-size:13px;min-height:40px;padding:8px 12px;border:1px solid #cad8e8;border-radius:8px;background:#fff;color:#27476b;cursor:pointer;word-break:keep-all}
.tenant-auto-tabs button[aria-selected="true"]{background:#eaf2ff;border-color:#8aaddb;font-weight:700}
.tenant-auto-readiness{border-top:1px solid #e1e8f0;padding-top:12px;display:grid;gap:8px;min-width:0}
.tenant-auto-readiness strong{font-size:15px;color:#243e5c;word-break:keep-all}
.tenant-auto-readiness p{margin:0;font-size:13px;line-height:1.6;color:#526176;word-break:keep-all}
.tenant-auto-readiness a{color:#1459a9;font-weight:650;text-decoration:underline;text-underline-offset:3px}
.tenant-auto-readiness ul{padding-left:20px;margin:0}
.tenant-auto-readiness li{font-size:13px;line-height:1.65;margin:3px 0;word-break:keep-all}
.tenant-auto-panel{min-width:0;border-top:1px solid #e1e8f0;padding-top:12px}
.tenant-auto-panel[hidden]{display:none!important}
.tenant-auto-panel h3{margin:0 0 8px;font-size:15px}
.tenant-auto-panel p{font-size:13px;line-height:1.7;color:#526176;word-break:keep-all}
.tenant-auto-panel a{color:#1459a9;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.tenant-auto-panel ul{padding-left:20px;margin:6px 0}
.tenant-auto-panel li{margin:4px 0;font-size:13px;line-height:1.6;word-break:keep-all}
@media(max-width:620px){.tenant-auto-overview{padding:12px}.tenant-auto-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.tenant-auto-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.tenant-auto-tabs button{padding:8px 4px;min-width:0}}
`;

export function tenantAutomationOverviewModel({connections=[],publishChannels=[],jobs=[],connectionsLoaded=false,publishingLoaded=false,jobsLoaded=false,policy={},growthOverview=null,ownedAutopostStatus=null,subjectKey='',service='',adminBase=''}={}) {
  const channels=Array.isArray(connections)?connections:[];
  const publishing=Array.isArray(publishChannels)?publishChannels:[];
  const queue=Array.isArray(jobs)?jobs:[];
  const activeChannels=connectionsLoaded?channels.filter(c=>c.status==='active').length:null;
  const automaticChannels=publishingLoaded?publishing.filter(c=>c.status==='active'&&c.config?.autoPublishEnabled!==false).length:null;
  const published=jobsLoaded?queue.filter(j=>j.status==='published').length:null;
  const pending=jobsLoaded?queue.filter(j=>['queued','scheduled','retrying'].includes(j.status)).length:null;
  const failed=jobsLoaded?queue.filter(j=>['failed','credentials_required'].includes(j.status)).length:null;
  const lastPublished=jobsLoaded?queue.filter(j=>j.status==='published'&&j.published_at)
    .map(j=>String(j.published_at)).sort().at(-1)||null:null;
  const campaign=growthOverview?.ok===true&&growthOverview.subject?.type==='tenant'
    ?growthOverview.campaigns:null;
  // A shared health response reports multiple owned sites. Project only the
  // exact current tenant, and allowlist status fields before any UI rendering.
  const tenantKey=String(subjectKey||'').trim();
  const approvedStates=new Set(['ready','channel_required','content_required','policy_review','plan_required','pending']);
  const source=ownedAutopostStatus?.ok===true&&Array.isArray(ownedAutopostStatus.subjects)
    ?ownedAutopostStatus.subjects.find(s=>s?.subjectType==='tenant'&&s?.subjectKey===tenantKey):null;
  const saneCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000?value:null;
  const autopost=source&&approvedStates.has(source.state)?{
    state:source.state,
    activeChannels:saneCount(source.activeChannels),
    usableChannels:saneCount(source.usableChannels),
    eligibleContent:saneCount(source.eligibleContent),
    pendingJobs:saneCount(source.pendingJobs),
    policyMode:['review','assisted','autonomous','missing'].includes(source.policyMode)?source.policyMode:'unknown',
  }:null;
  const mall=service==='mall';
  const safeAdmin=/^\/[a-z0-9/_-]+$/i.test(String(adminBase||''))?adminBase:'';
  return {activeChannels,automaticChannels,published,pending,failed,lastPublished,autopost,
    policyMode:String(policy.mode||'unknown').slice(0,24),campaign,
    mall,adminBase:safeAdmin,
    // Source absence must not be represented as a successful zero count.
    discovery:'provider_evidence_not_connected',
    recommendation:mall?'mall_management_link':'not_connected',
    performance:mall?'mall_management_link':'not_connected'};
}

export function tenantAutomationOverviewHtml(model) {
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const count=value=>value===null||value===undefined?'미연동':String(Math.max(0,Number(value)||0));
  const url=model.adminBase||'';
  const toManagement=path=>url?'<a href="'+escape(url+path)+'">해당 관리 화면 보기</a>':'관리 경로 미확인';
  const official=model.autopost;
  const modeLabels={ready:'발행 조건 충족',channel_required:'채널 연결 필요',content_required:'승인 콘텐츠 필요',
    plan_required:'구독 상태 확인 필요',policy_review:'자동게시 정책 확인 필요',pending:'게시 작업 처리 중'};
  const optionalCount=value=>value===null||value===undefined?'확인 필요':String(value);
  const readiness=official?
    '<section class="tenant-auto-readiness" aria-label="실제 자동게시 준비 상태">'+
    '<strong>자동게시 준비 상태 · '+escape(modeLabels[official.state]||'확인 필요')+'</strong>'+
    '<p>서버 원장 기준 · 활성 OAuth 채널 '+optionalCount(official.activeChannels)+'개 · 사용 가능 채널 '+optionalCount(official.usableChannels)+'개 · 승인된 게시 대상 '+optionalCount(official.eligibleContent)+'건 · 대기 '+optionalCount(official.pendingJobs)+'건</p>'+
    '<ul>'+
    (official.state==='plan_required'?'<li>구독·이용 권한을 먼저 확인해야 합니다.</li>':'')+
    (official.state==='policy_review'?'<li><a href="#channel-policy">게시 운영 정책 확인</a> 후 승인된 설정을 사용하세요.</li>':'')+
    (official.activeChannels===0?'<li><a href="#channel-account-section">외부 채널 최초 연결</a>이 필요합니다. 외부 서비스 인증은 계정 소유자가 직접 승인합니다.</li>':'')+
    (official.activeChannels!==0&&official.usableChannels===0?'<li><a href="#channel-overview">게시 채널 상태</a>와 허용 공급자 정책을 확인하세요.</li>':'')+
    (official.eligibleContent===0?'<li>승인된 자동게시 콘텐츠가 없습니다. 관리자 콘텐츠 승인 원장에서 게시 대상 여부를 확인하세요.</li>':'')+
    (official.state==='ready'?'<li>서버의 발행 선행조건을 통과했습니다. 실제 발행과 방문·매출 성과는 별도로 검증합니다.</li>':'')+
    (official.state==='pending'?'<li><a href="#channel-jobs">게시 작업 목록</a>에서 예약·재시도 상태를 확인하세요.</li>':'')+
    '</ul><p>이 요약은 해당 사이트의 조회 정보만 표시하며 채널을 연결하거나 게시물을 승인·발행하지 않습니다.</p></section>':'';
  const entry=[
    ['discovery','검색노출','<h3>검색노출 · SEO/AEO/GEO</h3><p>이 사이트의 검색엔진 등록·색인·AI 인용 실적은 별도 공급자 증거가 필요합니다. 공개 URL 또는 사이트맵이 존재해도 검색 결과 노출을 보장하지 않습니다.</p><p><a href="/sitemap.xml" target="_blank" rel="noopener">통합 공개 사이트맵 확인</a></p>'],
    ['recommendation','AI 추천','<h3>콘텐츠·상품 추천</h3><p>'+(model.mall?'상품별 AI 추천 판단은 에코디몰의 기존 자동영업 화면을 사용합니다.':'사이트별 추천 실적 원장이 아직 연결되지 않았습니다. 없는 수치를 0건으로 표시하지 않습니다.')+'</p>'+(model.mall?'<p>'+toManagement('/growth')+'</p>':'')],
    ['promotion','홍보','<h3>홍보 캠페인</h3><ul><li>등록 캠페인: '+count(model.campaign?.total)+'</li><li>승인 대기: '+count(model.campaign?.awaitingApproval)+'</li><li>실패 캠페인: '+count(model.campaign?.failed)+'</li></ul><p>홍보 캠페인 실적과 실제 방문·전환은 구분합니다. 승인되지 않은 외부 발행이나 광고비 집행은 이 화면에서 실행되지 않습니다.</p>'],
    ['publishing','자동게시','<h3>채널·게시 자동화</h3><ul><li>활성 연결 채널: '+count(model.activeChannels)+'</li><li>자동게시 설정 채널: '+count(model.automaticChannels)+'</li><li>운영 정책: '+escape(model.policyMode)+'</li><li>예약·재시도 대기: '+count(model.pending)+'</li></ul><p>채널별 시간·한도·실패 재시도 설정은 기존 채널 관리에서 조정합니다.</p>'],
    ['performance','성과','<h3>발행·성과</h3><ul><li>조회된 작업 원장 내 게시 성공: '+count(model.published)+'</li><li>마지막 성공: '+escape(model.lastPublished||(model.published===null?'연동 미확인':'기록 없음'))+'</li></ul><p>조회된 작업 목록의 성공 수는 전체 누적 실적이나 검색 유입·주문·수익을 의미하지 않습니다.</p>'+(model.mall?'<p>'+toManagement('/analytics')+'</p>':'<p>검색 유입 및 전환 측정은 아직 별도 검증이 필요합니다.</p>')],
    ['errors','오류·조치','<h3>확인할 문제</h3><ul><li>조회된 실패·인증 필요 작업: '+count(model.failed)+'</li><li>예약·재시도 작업: '+count(model.pending)+'</li></ul><p>실패 원인과 재시도 조치는 아래의 「최근 게시 작업」에서 상세히 확인합니다. 타 사이트 데이터는 조회하지 않습니다.</p>'],
  ];
  return '<section id="tenantAutoOverview" class="tenant-auto-overview" aria-labelledby="tenantAutoHeading">'+
    '<header><h2 id="tenantAutoHeading">이 사이트의 검색·추천·홍보 자동화</h2><p>현재 사이트 권한으로 읽은 결과만 표시합니다. 중앙 최고관리자 화면은 여러 사이트의 요약만 제공합니다.</p></header>'+
    readiness+
    '<div class="tenant-auto-summary" aria-label="자동화 핵심 지표">'+
    [['연결 채널',model.activeChannels],['게시 자동화 ON',model.automaticChannels],['조회된 발행 성공',model.published],['조회된 오류',model.failed]]
    .map(([label,value])=>'<article><small>'+escape(label)+'</small><strong>'+count(value)+'</strong></article>').join('')+'</div>'+
    '<nav class="tenant-auto-tabs" role="tablist" aria-label="자동화 세부 항목">'+
    entry.map(([id,label],i)=>'<button type="button" role="tab" id="tenantAutoTab-'+id+'" data-tenant-auto-tab="'+id+'" aria-controls="tenantAutoPanel-'+id+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?'0':'-1')+'">'+escape(label)+'</button>').join('')+'</nav>'+
    entry.map(([id,,html],i)=>'<section class="tenant-auto-panel" id="tenantAutoPanel-'+id+'" role="tabpanel" aria-labelledby="tenantAutoTab-'+id+'" tabindex="0"'+(i?' hidden':'')+'>'+html+'</section>').join('')+
    '<p class="tenant-auto-note">게시·광고 실행과 권한·비용 승인은 기존 서버 정책을 따르며, 상태 보기만으로 자동화가 활성화되지는 않습니다.</p></section>';
}

export function bindTenantAutomationOverview(root) {
  if(!root)return;
  const tabs=[...root.querySelectorAll('[data-tenant-auto-tab]')];
  function select(tab,focus=false){
    for(const button of tabs){
      const active=button===tab;
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
      const panel=root.querySelector('#tenantAutoPanel-'+button.dataset.tenantAutoTab);
      if(panel)panel.hidden=!active;
    }
    if(focus)tab.focus();
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(tab));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
        (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      select(tabs[next],true);
    });
  });
}
