CREATE TABLE IF NOT EXISTS affiliate_partner_programs (
  program_key TEXT PRIMARY KEY, program_name TEXT NOT NULL, program_kind TEXT NOT NULL DEFAULT 'network',
  region TEXT NOT NULL DEFAULT 'KR', home_country TEXT NOT NULL DEFAULT 'KR', coverage_summary TEXT NOT NULL DEFAULT '',
  application_status TEXT NOT NULL DEFAULT 'candidate', integration_status TEXT NOT NULL DEFAULT 'not_ready',
  api_capable INTEGER NOT NULL DEFAULT 0, deeplink_capable INTEGER NOT NULL DEFAULT 0,
  product_feed_capable INTEGER NOT NULL DEFAULT 0, reporting_capable INTEGER NOT NULL DEFAULT 0,
  external_action_required INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 0,
  program_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_affiliate_partner_programs_pipeline
  ON affiliate_partner_programs(application_status, integration_status, priority DESC);

INSERT OR IGNORE INTO affiliate_partner_programs
(program_key,program_name,program_kind,region,home_country,coverage_summary,application_status,integration_status,api_capable,deeplink_capable,product_feed_capable,reporting_capable,external_action_required,priority,program_url,notes,created_at,updated_at)
VALUES
('coupang_partners','Coupang Partners','direct','KR','KR','쿠팡','active','live',1,1,1,1,0,100,'https://partners.coupang.com/','현재 운영 연결',datetime('now'),datetime('now')),
('linkprice','LinkPrice','network','KR+GLOBAL','KR','국내외 약 200 광고주','account_exists','not_ready',1,1,1,1,1,98,'https://www.linkprice.com/','기존 회원 계정 기준. 머천트 승인·API 활성 확인 필요.',datetime('now'),datetime('now')),
('adpick','ADPICK Biz','network','KR+GLOBAL','KR','국내외 40+ 쇼핑몰','prepared','not_ready',1,1,1,1,1,96,'https://biz.adpick.co.kr/','Business API·자동 링크·리포트 연결 후보',datetime('now'),datetime('now')),
('tenping','Tenping','network','KR','KR','제휴몰·콘텐츠 캠페인','prepared','not_ready',0,1,0,1,1,72,'https://tenping.kr/','수동/딥링크 우선 후보',datetime('now'),datetime('now')),
('impact','impact.com','network','GLOBAL','US','글로벌 브랜드·상품 마켓플레이스','prepared','not_ready',1,1,1,1,1,94,'https://impact.com/partners/','미디어 속성·세금정보·승인 필요',datetime('now'),datetime('now')),
('rakuten','Rakuten Advertising','network','GLOBAL','US','190+ 국가 도달 글로벌 광고주','prepared','not_ready',1,1,1,1,1,91,'https://rakutenadvertising.com/solutions/publishers/','Publisher 가입 및 광고주별 승인 필요',datetime('now'),datetime('now')),
('cj','CJ Affiliate','network','GLOBAL','US','글로벌 브랜드·퍼블리셔 네트워크','prepared','not_ready',1,1,1,1,1,90,'https://www.cj.com/publisher','Publisher 가입·광고주 승인 필요',datetime('now'),datetime('now')),
('amazon_associates','Amazon Associates','direct','GLOBAL','US','국가별 Amazon Associates 프로그램','prepared','not_ready',1,1,1,1,1,88,'https://affiliate-program.amazon.com/','국가별 별도 프로그램·세금/정산 설정 확인',datetime('now'),datetime('now')),
('awin','Awin','network','GLOBAL','GB','글로벌 광고주·브랜드 네트워크','prepared','not_ready',1,1,1,1,1,86,'https://www.awin.com/','Publisher 가입·컴플라이언스 확인 필요',datetime('now'),datetime('now')),
('partnerize','Partnerize','network','GLOBAL','US','글로벌 브랜드 파트너십','prepared','not_ready',1,1,1,1,1,82,'https://partnerize.com/partners/affiliates','브랜드별 신청·승인 필요',datetime('now'),datetime('now')),
('admitad','Admitad','network','GLOBAL','AE','글로벌 2,000+ 광고주·XML Feed','prepared','not_ready',1,1,1,1,1,80,'https://www.admitad.com/affiliates/','딥링크·XML Feed 우선 검토',datetime('now'),datetime('now')),
('taobao_alliance','淘宝联盟 / Alimama','network','CN','CN','淘宝·天猫','prepared','not_ready',1,1,1,1,1,78,'https://pub.alimama.com/','한국 운영 주체 참여·API 권한 확인',datetime('now'),datetime('now')),
('jd_union','京东联盟','network','CN','CN','京东','prepared','not_ready',1,1,1,1,1,76,'https://jos.jd.com/jdunion','JOS/联盟 권한 확인',datetime('now'),datetime('now')),
('aliexpress_affiliate','AliExpress Affiliate','direct','GLOBAL/CN','CN','AliExpress','prepared','not_ready',1,1,1,1,1,84,'https://portals.aliexpress.com/','가입·승인·상품 Feed 확인',datetime('now'),datetime('now')),
('duoduo_jinbao','多多进宝','network','CN','CN','拼多多','candidate','not_ready',1,1,1,1,1,60,'','한국 운영 주체 참여 가능 여부 확인',datetime('now'),datetime('now'));
