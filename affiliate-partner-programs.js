export const AFFILIATE_PROGRAM_STATUSES = new Set(['candidate', 'prepared', 'account_exists', 'applied', 'review', 'approved', 'active', 'blocked']);
export const AFFILIATE_INTEGRATION_STATUSES = new Set(['not_ready', 'manual', 'deeplink', 'api', 'feed', 'live']);
export const AFFILIATE_OUTREACH_STATUSES = new Set(['none', 'planned', 'sent', 'replied', 'action_required', 'closed']);

export const AFFILIATE_PARTNER_PROGRAMS = [
  { key:'coupang_partners', name:'Coupang Partners', kind:'direct', region:'KR', country:'KR', coverage:'쿠팡', status:'active', integration:'live', api:1, deeplink:1, feed:1, reporting:1, external:0, priority:100, url:'https://partners.coupang.com/' },
  { key:'linkprice', name:'LinkPrice', kind:'network', region:'KR+GLOBAL', country:'KR', coverage:'국내외 제휴 광고주', status:'account_exists', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:98, url:'https://www.linkprice.com/affiliate/2022_index.html' },
  { key:'adpick', name:'ADPICK Biz', kind:'network', region:'KR+GLOBAL', country:'KR', coverage:'국내외 제휴 쇼핑몰', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:96, url:'https://biz.adpick.co.kr/' },
  { key:'tenping', name:'Tenping', kind:'network', region:'KR', country:'KR', coverage:'제휴몰·콘텐츠 캠페인', status:'prepared', integration:'not_ready', api:0, deeplink:1, feed:0, reporting:1, external:1, priority:72, url:'https://tenping.kr/' },
  { key:'impact', name:'impact.com', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 브랜드·상품 마켓플레이스', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:94, url:'https://impact.com/partners/affiliate-partners/' },
  { key:'rakuten', name:'Rakuten Advertising', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 광고주 네트워크', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:91, url:'https://rakutenadvertising.com/solutions/publishers/' },
  { key:'cj', name:'CJ Affiliate', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 브랜드·퍼블리셔 네트워크', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:90, url:'https://www.cj.com/join' },
  { key:'amazon_associates', name:'Amazon Associates', kind:'direct', region:'GLOBAL', country:'US', coverage:'국가별 Amazon Associates 프로그램', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:88, url:'https://affiliate-program.amazon.com/' },
  { key:'awin', name:'Awin', kind:'network', region:'GLOBAL', country:'GB', coverage:'글로벌 광고주·브랜드 네트워크', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:86, url:'https://www.awin.com/' },
  { key:'partnerize', name:'Partnerize', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 브랜드 파트너십', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:82, url:'https://partnerize.com/partners/affiliates' },
  { key:'admitad', name:'Admitad', kind:'network', region:'GLOBAL', country:'AE', coverage:'글로벌 광고주·상품 Feed', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:80, url:'https://www.admitad.com/affiliates/' },
  { key:'taobao_alliance', name:'淘宝联盟 / Alimama', kind:'network', region:'CN', country:'CN', coverage:'淘宝·天猫', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:78, url:'https://pub.alimama.com/' },
  { key:'jd_union', name:'京东联盟', kind:'network', region:'CN', country:'CN', coverage:'京东', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:76, url:'https://jos.jd.com/jdunion' },
  { key:'aliexpress_affiliate', name:'AliExpress Affiliate', kind:'direct', region:'GLOBAL/CN', country:'CN', coverage:'AliExpress', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:84, url:'https://portals.aliexpress.com/' },
  { key:'duoduo_jinbao', name:'多多进宝', kind:'network', region:'CN', country:'CN', coverage:'拼多多', status:'candidate', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:60, url:'' },
];

const PLAYBOOKS = {
  coupang_partners:{ requirements:['계정','API 자격정보','제휴 고지'], docsUrl:'https://partners.coupang.com/' },
  linkprice:{ requirements:['회원계정','운영 매체','머천트 승인','API 권한'], docsUrl:'https://www.linkprice.com/affiliate/views/affiliate_marketing/plus_service_api.html' },
  adpick:{ requirements:['회원계정','API Key','운영 매체'], docsUrl:'https://biz.adpick.co.kr/?ac=api&sub=guide' },
  tenping:{ requirements:['회원계정','운영 매체','캠페인 승인'] },
  impact:{ requirements:['Publisher 계정','운영 매체','지급·세금 정보','브랜드 승인'] },
  rakuten:{ requirements:['Publisher 계정','운영 매체','지급·세금 정보','광고주 승인'] },
  cj:{ requirements:['Publisher 계정','유효한 웹사이트','지급·세금 정보','광고주 승인'], docsUrl:'https://www.cj.com/support' },
  amazon_associates:{ requirements:['국가별 계정','운영 매체','지급·세금 정보','프로그램 정책 확인'] },
  awin:{ requirements:['Publisher 계정','운영 매체','지급 정보','광고주 승인'] },
  partnerize:{ requirements:['Partner 계정','운영 매체','브랜드 승인'] },
  admitad:{ requirements:['Publisher 계정','운영 매체','프로그램 승인','Feed/API 권한'] },
  taobao_alliance:{ requirements:['운영 주체 자격','联盟 계정','API 권한','정산 수단'] },
  jd_union:{ requirements:['운영 주체 자격','联盟 계정','JOS/API 권한','정산 수단'] },
  aliexpress_affiliate:{ requirements:['Affiliate 계정','운영 매체','API/Feed 권한','정산 수단'] },
  duoduo_jinbao:{ requirements:['한국 운영 주체 참여 가능 여부','联盟 계정','API 권한','정산 수단'] },
};

function nextAction(applicationStatus, integrationStatus, outreachStatus = 'none') {
  if (outreachStatus === 'action_required') return '회신의 추가 요구사항을 처리하고 신청·승인 상태를 갱신';
  if (outreachStatus === 'replied' && !['approved','active'].includes(applicationStatus)) return '회신 내용을 반영해 계정·매체 등록 또는 권한 신청으로 진행';
  if (outreachStatus === 'sent' && ['prepared','account_exists'].includes(applicationStatus)) return '회신을 확인하고 계정·매체 등록 또는 API·딥링크 권한 신청으로 진행';
  if (applicationStatus === 'blocked') return '보류 사유를 확인하고 가입 요건을 보완';
  if (applicationStatus === 'candidate') return '운영 주체의 가입 가능 여부와 약관을 확인';
  if (applicationStatus === 'prepared') return '공식 가입 페이지에서 계정·매체·정산 정보를 제출';
  if (applicationStatus === 'account_exists') return '머천트/광고주 승인과 API·딥링크 권한을 확인';
  if (applicationStatus === 'applied' || applicationStatus === 'review') return '심사 결과와 추가 요청사항을 확인';
  if (applicationStatus === 'approved' && integrationStatus === 'not_ready') return '추적링크를 발급하고 API/Feed 연결을 검증';
  if (applicationStatus === 'approved') return '상품·가격·성과 리포트를 검증하고 실연동으로 전환';
  if (applicationStatus === 'active' && integrationStatus !== 'live') return '실연동 검증을 완료하고 live로 전환';
  return '성과·정책·정산 상태를 주기적으로 점검';
}

function readinessScore(applicationStatus, integrationStatus) {
  const application = { candidate:5, prepared:20, account_exists:35, applied:45, review:55, approved:70, active:80, blocked:0 }[applicationStatus] ?? 0;
  const integration = { not_ready:0, manual:5, deeplink:10, api:15, feed:18, live:20 }[integrationStatus] ?? 0;
  return Math.min(100, application + integration);
}

export function partnerProgramView(row = {}) {
  const playbook = PLAYBOOKS[row.program_key] || { requirements:[] };
  const action = nextAction(row.application_status, row.integration_status, row.outreach_status || 'none');
  return {
    programKey: row.program_key, programName: row.program_name, programKind: row.program_kind,
    region: row.region, homeCountry: row.home_country,
    coverageSummary: `${row.coverage_summary}${action ? ` · 다음: ${action}` : ''}`,
    applicationStatus: row.application_status, integrationStatus: row.integration_status,
    apiCapable: Boolean(row.api_capable), deepLinkCapable: Boolean(row.deeplink_capable),
    productFeedCapable: Boolean(row.product_feed_capable), reportingCapable: Boolean(row.reporting_capable),
    externalActionRequired: Boolean(row.external_action_required), priority: Number(row.priority || 0),
    programUrl: (AFFILIATE_PARTNER_PROGRAMS.find(item => item.key === row.program_key)?.url || row.program_url || ''),
    docsUrl: playbook.docsUrl || '', requirements: playbook.requirements,
    nextAction: action, readinessScore: readinessScore(row.application_status, row.integration_status),
    outreachStatus: row.outreach_status || 'none', outreachChannel: row.outreach_channel || '',
    lastOutreachAt: row.last_outreach_at || null, nextFollowupAt: row.next_followup_at || null, outreachNote: row.outreach_note || '',
    notes: row.notes || '', updatedAt: row.updated_at || null,
  };
}
