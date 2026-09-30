-- Seed existing Seonam Medi activity history in D1 outside the public request path.
-- This migration is idempotent via legacy_key and preserves the pre-existing public history.

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-001','1990.05','장기연혁','목포대 의과대학 신설 건의 시작','목포시 공식 추진사항은 국립목포대가 1990년 5월 정부에 의대 신설을 건의하기 시작했다고 정리합니다.','목포시 공식자료','[]','[]','[]','published',0,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-002','2007','장기연혁','의대 신설 관련 대통령 공약 반영','목포시 공식 추진사항은 2007년 제17대 대통령 선거 과정에서 목포대 의대 신설이 공약에 반영됐다고 기록합니다.','목포시 공식자료','[]','[]','[]','published',1,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-003','2012','장기연혁','의대 신설 관련 공약·지역 서명운동','목포시 공식자료는 2012년 제18대 대통령 선거 공약 반영을 기록하고, 국립목포대 총장백서는 같은 해 도민결의대회와 서명운동 추진 이력을 소개합니다.','공식자료','[]','[]','[]','published',2,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-004','2018.07–2019.11','정부·대학','목포대 의과대학 설립 타당성 연구용역','목포시 공식 추진사항은 교육부 주관 타당성 연구용역이 이 기간 진행됐다고 정리합니다.','목포시 공식자료','[]','[]','[]','published',3,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-005','2023.01.19','정부·대학','권역별 국립대학교 의과대학 설립 공동 포럼','국립목포대 연혁에 공동 포럼 개최와 공동건의문 발표가 기록돼 있습니다.','국립목포대 공식자료','[]','[]','[]','published',4,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-006','2024.03.14','정부·대학','전남 국립의대 신설 추진 발표','목포시 공식 추진사항은 당시 정부가 전남 국립의대 신설 추진을 발표했다고 기록합니다.','목포시 공식자료','[]','[]','[]','published',5,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-007','2024.11.15','정부·대학','목포대·순천대 대학통합을 통한 국립의대 추진 합의','목포시 공식 추진사항에 양 대학 총장의 통합 추진 합의가 기록돼 있습니다.','목포시 공식자료','[]','[]','[]','published',6,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-008','2024.11.22','정부·대학','통합대학교 국립의대 정부 추천','목포시 공식 추진사항은 전라남도가 통합대학교 국립의과대학을 정부에 추천했다고 기록합니다.','목포시 공식자료','[]','[]','[]','published',7,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-009','2025.05.26','정부·대학','통합의대 설립 공동준비위원회 출범','양 대학 공동준비위원회 출범 이력이 목포시 공식 추진사항에 포함돼 있습니다.','목포시 공식자료','[]','[]','[]','published',8,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-010','2026.02.10','정부·대학','의사인력 양성규모 발표','목포시 공식 추진사항은 보건복지부 발표와 함께 의대 없는 지역 신설 시 2030년 개교·정원 100명 고려 내용을 기록합니다.','목포시 공식자료','[]','[]','[]','published',9,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-011','2026.07.02','정부·대학','국립의대 신설 중재안 제안','전남광주대전환기획위가 목포대·순천대의 국립의대 신설과 관련한 중재안을 제안한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',10,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-012','2026.07.14','정부·대학','양 대학 자율협의·통합신청서 제출 요구','전남광주대전환기획위가 양 대학 회신 결과를 발표하고 자율 협의를 통한 통합신청서 제출을 요구한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',11,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-013','2026.07.20','정부·대학','지역 완결형 필수·공공의료체계 권고안','전남광주대전환기획위가 지역 완결형 필수·공공의료체계 구축 권고안을 발표한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',12,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-014','2026.07.27','정부·대학','공공의료혁신추진단 구성 발표','전남광주통합특별시가 공공의료혁신추진단 구성과 초광역 통합의료벨트 구축을 발표한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',13,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-015','2026.08.02','정부·대학','통합 국립의대 긴급 조정회의','통합 국립의대 설립 및 초광역 통합의료벨트 구축을 위한 긴급 조정회의가 열린 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',14,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-016','2026.08.06','정부·대학','교육부, 지역 의대 신설 추진계획서 제출 요청','교육부가 지역 의과대학 신설 추진계획서 제출을 요청한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',15,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-017','2026.08.20','정부·대학','의과대학 신설 추진계획서 교육부 제출','전남광주통합특별시가 의과대학 신설 추진계획서를 교육부에 제출한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',16,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-018','2026.08.26','정부·대학','교육부, 지역 의대 신설 추진계획서 재제출 요청','교육부가 지역 의과대학 신설 추진계획서 재제출을 요청한 것으로 당시 일지 보도에 정리돼 있습니다.','언론보도','[]','[]','[]','published',17,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-019','2026.08.30','후보대학 선정','전남광주특별시 국립의대 후보대학 선정 결과 발표','전남광주특별시는 순천대를 후보대학으로 선정했으며 보도된 평가점수는 순천대 89.15점, 목포대 87.85점입니다.','공식발표·언론보도','[{"label":"후보대학 선정 보도","source":"뉴시스","url":"https://www.newsis.com/view/NISX20260830_0003768417"}]','[{"type":"photo","label":"후보대학 선정 관련 현장·발표 사진이 포함된 보도","source":"뉴시스","date":"2026-08-30","url":"https://www.newsis.com/view/NISX20260830_0003768417"}]','["후보대학","순천대","선정","목포대"]','published',18,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seonammedi_timeline(
  legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
) VALUES(
  'seed-020','2026.09.21','비대위 활동','서울 상경투쟁 및 기자회견·공개서한 일정','비대위 참가자 자료집에는 국회 소통관·국회 정문·정당 당사·청와대 앞 기자회견과 공개서한 전달 일정이 포함돼 있습니다. 각 일정의 완료 여부는 후속 현장자료와 보도로 계속 확인합니다.','비대위 현장자료','[{"label":"국회 기자회견 보도","source":"청년의사","url":"https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961"}]','[{"type":"photo","label":"국회 기자회견 사진이 포함된 보도","source":"청년의사 · 사진출처 국회인터넷의사중계시스템","date":"2026-09-21","url":"https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961"}]','["국회","기자회견","비상대책위원회","상경","공개서한"]','published',19,'system-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO seonammedi_seed_state(seed_key,applied_at) VALUES('timeline-v1',CURRENT_TIMESTAMP);
