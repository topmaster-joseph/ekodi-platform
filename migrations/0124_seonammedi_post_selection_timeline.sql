-- Reconcile the verified post-2026-08-30 SeonamMedi activity chronology into production D1.
-- Additive/idempotent: existing canonical legacy keys are updated; missing keys are inserted.

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260902','2026.09.02','비대위 활동','목포대 총학생회 선정 절차 공개·재검토 요구','국립목포대학교 총학생회는 후보대학 선정 과정의 세부 채점 내역과 심사자료 공개, 선정 절차 재검토를 요구하는 입장을 발표했다. 이후 지역 시민사회와 대학 구성원의 공동 대응이 확대됐다.','당사자 발표·언론보도','[{"label":"목포대 총학생회 입장 보도","source":"뉴시스","url":"https://www.newsis.com/view/NISX20260902_0003773352"},{"label":"총학생회 공개·재검토 요구 보도","source":"목포MBC","url":"https://www.mpmbc.co.kr/NewsArticle/1535177"}]','[]','["총학생회","심사자료","재검토","목포대","9월2일"]','published',19,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260903','2026.09.03','비대위 활동','광주청사 릴레이 시위·청와대 상경집회 준비','목포시의회 의원들의 광주청사 앞 릴레이 1인 시위와 시민사회의 상경집회 준비가 이어졌다. 관련 보도에서는 후보대학 선정 과정의 자료 공개와 재검증 요구가 지역 단위 공동행동으로 확대된 것으로 전했다.','언론보도','[{"label":"청와대 상경집회 준비와 지역 시위 보도","source":"쿠키뉴스","url":"https://m.kukinews.com/article/view/kuk202609030113"},{"label":"목포 시민연대 상경집회 예고 보도","source":"뉴스핌","url":"https://www.newspim.com/news/view/20260903000831"}]','[]','["광주청사","릴레이 시위","청와대","상경집회","재검증"]','published',20,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260904','2026.09.04','비대위 활동','지역 공동 기자회견·재심사 요구와 법적 대응 본격화','목포 지역 정치권·시민사회는 전남광주특별시 무안청사와 국회에서 후보대학 선정 과정의 자료 공개와 재검토를 요구했다. 같은 날 목포대는 후보대학 선정·추천 처분 취소 소송과 효력정지 신청 절차에 나섰다.','언론보도·당사자 발표','[{"label":"목포대·지역사회 반발 및 법적 대응 보도","source":"연합뉴스","url":"https://www.yna.co.kr/view/AKR20260904092551054"}]','[{"type":"photo","label":"국립의대 추천안 전면 재검토 촉구 현장 사진","source":"연합뉴스","date":"2026-09-04","url":"https://www.yna.co.kr/view/AKR20260904092551054"}]','["목포대","재심사","무안청사","국립의대","소송"]','published',21,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260905','2026.09.05','비대위 활동','청와대 앞 재심사 촉구와 삭발 행동','목포·서남권 지역 정치인과 목포대 교수 등 참가자들이 청와대 앞에서 후보대학 선정 재심사를 요구했고 일부 참가자들이 삭발했다. 이후 지역사회 집회와 비상대책 활동이 이어졌다.','언론보도','[{"label":"청와대 앞 재심사 촉구·삭발 행동 관련 보도","source":"연합뉴스","url":"https://www.yna.co.kr/amp/view/AKR20260914107500054"}]','[]','["청와대","삭발","재심사","목포대","서남권"]','published',22,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260907','2026.09.07','비대위 활동','목포 평화광장 서남권 총궐기대회','서남권 의대 비상대책 활동에 참여한 시민들이 목포 평화광장에 모여 후보대학 선정 과정의 공개와 재검증을 요구했다. 보도에는 목포·무안·신안·영암·해남·진도·완도 등 서남권 주민과 시민사회가 참여한 것으로 전해졌다.','현장보도','[{"label":"서남권 대규모 총궐기 보도","source":"목포MBC","url":"https://www.mpmbc.co.kr/NewsArticle/1535848"},{"label":"평화광장 총궐기 현장보도","source":"더파워","url":"https://www.thepowernews.co.kr/view.php?ud=202609072141157121caa2b7671d_7"}]','[{"type":"photo","label":"목포 평화광장 총궐기 현장 사진","source":"더파워","date":"2026-09-07","url":"https://www.thepowernews.co.kr/view.php?ud=202609072141157121caa2b7671d_7"}]','["평화광장","총궐기","서남권","재검증","목포대"]','published',23,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260908','2026.09.08','비대위 활동','전남광주특별시의회 본회의장 앞 항의','서남권 의대 비상대책위원회 관계자와 시민들은 전남광주통합특별시의회 본회의가 열린 날 후보대학 선정 과정의 공개와 소통을 요구하며 현장에서 항의했다.','언론보도','[{"label":"특별시의회 본회의장 앞 항의 보도","source":"쿠키뉴스","url":"https://www.kukinews.com/article/view/kuk202609080075"}]','[{"type":"photo","label":"특별시의회 현장 사진","source":"쿠키뉴스","date":"2026-09-08","url":"https://www.kukinews.com/article/view/kuk202609080075"}]','["특별시의회","민형배","비상대책위원회","심사결과","소통"]','published',24,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260909','2026.09.09','비대위 활동','교육부 앞 공동 기자회견·건의서 및 공개서한 전달','서남권 의대 비상대책위원회와 목포대학교 교수평의회는 세종시 교육부 앞에서 공동 기자회견을 열고 후보대학 추천 절차의 중단과 객관적 재검증을 요구했다. 관련 건의서와 교육부 장관 대상 공개서한 전달도 진행됐다.','언론보도·비대위 보도자료','[{"label":"교육부 재검증 요구 기자회견 보도","source":"전자신문","url":"https://www.etnews.com/20260909000413"}]','[]','["교육부","공동 기자회견","건의서","공개서한","재검증"]','published',25,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260914','2026.09.14','비대위 활동','목포대 학생 광주청사 피켓 시위','목포대 총학생회와 단과대 학생회 참가자들이 전남광주통합특별시 광주청사 앞에서 후보대학 심사 과정의 재검토와 자료 공개를 요구하는 피켓 시위를 진행했다. 비대위 활동과 병행된 대학 구성원 연대 행동으로 기록한다.','언론보도','[{"label":"목포대 학생 광주청사 피켓 시위 보도","source":"연합뉴스","url":"https://www.yna.co.kr/amp/view/AKR20260914107500054"}]','[{"type":"photo","label":"목포대 학생 광주청사 피켓 시위 사진","source":"연합뉴스","date":"2026-09-14","url":"https://www.yna.co.kr/amp/view/AKR20260914107500054"}]','["광주청사","총학생회","피켓","재검토","목포대"]','published',26,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260921','2026.09.21','비대위 활동','국회·민주당사·청와대 상경투쟁','서남권 의대 비상대책위원회는 시민 40여 명이 참여한 상경투쟁을 진행했다. 국회 소통관 기자회견, 국회 정문 앞 호소, 더불어민주당사 앞 기자회견과 항의서한 전달, 청와대 앞 기자회견과 대통령 공개서한 전달이 진행됐다고 비대위 보도자료와 관련 보도가 전했다.','비대위 보도자료·언론보도','[{"label":"상경투쟁 보도자료","source":"서남권 의대 비상대책위원회","url":"https://dudlsen.tistory.com/2263"},{"label":"국회 기자회견 보도","source":"청년의사","url":"https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961"}]','[{"type":"photo","label":"국회 기자회견 사진이 포함된 보도","source":"청년의사 · 사진출처 국회인터넷의사중계시스템","date":"2026-09-21","url":"https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961"}]','["국회","민주당사","청와대","상경투쟁","공개서한"]','published',27,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
VALUES('seed-bidaewee-20260922','2026.09.22','비대위 활동','광주지법 기자회견·차량행진·제4차 서남권 시민대회','서남권 의대 비상대책위원회는 광주지방법원 앞에서 집행정지 관련 기자회견을 연 뒤 목포에서 차량 약 70대가 참여한 도심 행진을 진행했다. 이어 목포 평화광장에서 제4차 서남권 시민대회를 열어 심사자료 공개와 독립적 재검증, 교육부 후속 절차 중단 등을 요구했다.','언론보도','[{"label":"집행정지 첫 심문·차량행진·시민대회 보도","source":"뉴시스","url":"https://www.newsis.com/view/NISX20260922_0003800353"},{"label":"차량행진·총궐기 보도","source":"한국경제","url":"https://www.hankyung.com/article/202609221413h"}]','[{"type":"photo","label":"서남권 의대 비대위 차량행진 현장 사진","source":"뉴시스","date":"2026-09-22","url":"https://www.newsis.com/view/NISX20260922_0003800353"}]','["광주지법","차량행진","평화광장","시민대회","집행정지"]','published',28,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT(legacy_key) DO UPDATE SET
 event_date=excluded.event_date,
 category=excluded.category,
 title=excluded.title,
 summary=excluded.summary,
 evidence=excluded.evidence,
 links_json=excluded.links_json,
 media_json=excluded.media_json,
 monitor_keywords_json=excluded.monitor_keywords_json,
 status='published',
 sort_order=excluded.sort_order,
 updated_at=CURRENT_TIMESTAMP;

