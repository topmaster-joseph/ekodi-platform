export const AFFILIATE_PROGRAM_STATUSES = new Set(['candidate', 'prepared', 'account_exists', 'applied', 'review', 'approved', 'active', 'blocked']);
export const AFFILIATE_INTEGRATION_STATUSES = new Set(['not_ready', 'manual', 'deeplink', 'api', 'feed', 'live']);

export const AFFILIATE_PARTNER_PROGRAMS = [
  { key:'coupang_partners', name:'Coupang Partners', kind:'direct', region:'KR', country:'KR', coverage:'쿠팡', status:'active', integration:'live', api:1, deeplink:1, feed:1, reporting:1, external:0, priority:100, url:'https://partners.coupang.com/' },
  { key:'linkprice', name:'LinkPrice', kind:'network', region:'KR+GLOBAL', country:'KR', coverage:'국내외 약 200 광고주', status:'account_exists', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:98, url:'https://www.linkprice.com/' },
  { key:'adpick', name:'ADPICK Biz', kind:'network', region:'KR+GLOBAL', country:'KR', coverage:'국내외 40+ 쇼핑몰', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:96, url:'https://biz.adpick.co.kr/' },
  { key:'tenping', name:'Tenping', kind:'network', region:'KR', country:'KR', coverage:'제휴몰·콘텐츠 캠페인', status:'prepared', integration:'not_ready', api:0, deeplink:1, feed:0, reporting:1, external:1, priority:72, url:'https://tenping.kr/' },
  { key:'impact', name:'impact.com', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 브랜드·상품 마켓플레이스', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:94, url:'https://impact.com/partners/' },
  { key:'rakuten', name:'Rakuten Advertising', kind:'network', region:'GLOBAL', country:'US', coverage:'190+ 국가 도달 글로벌 광고주', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:91, url:'https://rakutenadvertising.com/solutions/publishers/' },
  { key:'cj', name:'CJ Affiliate', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 브랜드·퍼블리셔 네트워크', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:90, url:'https://www.cj.com/publisher' },
  { key:'amazon_associates', name:'Amazon Associates', kind:'direct', region:'GLOBAL', country:'US', coverage:'국가별 Amazon Associates 프로그램', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:88, url:'https://affiliate-program.amazon.com/' },
  { key:'awin', name:'Awin', kind:'network', region:'GLOBAL', country:'GB', coverage:'글로벌 광고주·브랜드 네트워크', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:86, url:'https://www.awin.com/' },
  { key:'partnerize', name:'Partnerize', kind:'network', region:'GLOBAL', country:'US', coverage:'글로벌 브랜드 파트너십', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:82, url:'https://partnerize.com/partners/affiliates' },
  { key:'admitad', name:'Admitad', kind:'network', region:'GLOBAL', country:'AE', coverage:'글로벌 2,000+ 광고주·XML Feed', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:80, url:'https://www.admitad.com/affiliates/' },
  { key:'taobao_alliance', name:'淘宝联盟 / Alimama', kind:'network', region:'CN', country:'CN', coverage:'淘宝·天猫', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:78, url:'https://pub.alimama.com/' },
  { key:'jd_union', name:'京东联盟', kind:'network', region:'CN', country:'CN', coverage:'京东', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:76, url:'https://jos.jd.com/jdunion' },
  { key:'aliexpress_affiliate', name:'AliExpress Affiliate', kind:'direct', region:'GLOBAL/CN', country:'CN', coverage:'AliExpress', status:'prepared', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:84, url:'https://portals.aliexpress.com/' },
  { key:'duoduo_jinbao', name:'多多进宝', kind:'network', region:'CN', country:'CN', coverage:'拼多多', status:'candidate', integration:'not_ready', api:1, deeplink:1, feed:1, reporting:1, external:1, priority:60, url:'' },
];

export function partnerProgramView(row = {}) {
  return {
    programKey: row.program_key, programName: row.program_name, programKind: row.program_kind,
    region: row.region, homeCountry: row.home_country, coverageSummary: row.coverage_summary,
    applicationStatus: row.application_status, integrationStatus: row.integration_status,
    apiCapable: Boolean(row.api_capable), deepLinkCapable: Boolean(row.deeplink_capable),
    productFeedCapable: Boolean(row.product_feed_capable), reportingCapable: Boolean(row.reporting_capable),
    externalActionRequired: Boolean(row.external_action_required), priority: Number(row.priority || 0),
    programUrl: row.program_url || '', notes: row.notes || '', updatedAt: row.updated_at || null,
  };
}
