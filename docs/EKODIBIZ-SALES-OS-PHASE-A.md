# EKODIBIZ 통합 영업·제안·성과관리 — 1차 계약 기반

- 중앙 과제: https://github.com/topmaster-joseph/ekodi-platform/issues/9836
- 공식 작업 할당 브랜치: ai/generic/issue-9836-ekodi-ai
- 모듈: ekodibiz-sales-os-core.js (순수 함수, I/O 없음)
- 테스트: node --test test/ekodibiz-sales-os-core.test.mjs
- 상태: **검토용 소스 후보**. API, DB, 관리자 화면, 대외 발송, 계약 및 운영 배포를 완료했다고 주장하지 않는다.

## 소유권과 기존 기능 재사용

EKODIBIZ는 EKODI 수익사업의 사업운영, 고객 영업, 제안서, 계약, 수행, 성과관리를 통합한다. 기존 수익 엔진, 제안서 제작기, Marketing Ledger, 실현매출 원장을 재사용한다. 사업별 사이트는 자기 사업의 승인된 상품 소개와 문의 진입만 담당한다. 계약/세무 주체가 다른 사업자 데이터는 법적 주체별로 분리한다.

| 기능 | 기존 원천 | 연결 방향 |
| --- | --- | --- |
| 상품/서비스 | ekodibiz-worker.js | 검증된 상품 버전과 제안서 초안 연결 |
| 사업기회 | revenue-engine.js | Revenue Cell 상태를 영업 단계와 분리해 표시 |
| 영업 이벤트 | marketing-ledger-control.js | 검증된 실제 사건만 기록 |
| 문서 | proposal/core.js | 초안 생성과 승인/발송을 분리 |
| 매출 | revenue-ledger-d1.js | provider-confirmed 실현매출만 집계 |
| 승인 | business-os-core.js, AI Action Gateway | 외부발송·계약·금전행위는 인간 승인 |

## 구현된 경계

- 영업기회는 불변 workspaceId, businessLineId, 선택적 productId를 포함한다. URL slug는 권한 근거가 아니다.
- 단계: inquiry → consultation → proposal_draft → proposal_approved → proposal_sent → negotiating → contracted → delivery → renewal; 상황에 따라 lost. 전환 함수는 검증용 계획만 반환하며 데이터에 기록하거나 외부 실행하지 않는다.
- 인간 승인 필요 단계는 proposal_approved, proposal_sent, contracted이다. 서버에서 신뢰 가능한 영수증을 확인해야 실제 상태 변경이 가능하다.
- 제안서 참조는 항상 working_draft, unverified, not approved다. 숫자를 입력해도 승인된 견적이나 매출이 아니다.
- Marketing Ledger 이벤트는 planned_only이며, 최종 멱등성 external_ref에는 서버가 검증한 개별 이벤트 식별자가 필요하다.
- 사업분야별 영업 기댓값은 계약 전 단계만 합산하고 매출로 사용하지 않는다.
- native revenue adapter는 기존 D1 realized_revenue_events의 컬럼명 사용. tenant_key와 정규 workspaceId의 연관성을 인증된 서버가 확인해야 한다. 개인정보/메타데이터는 결과에서 제외한다.
- 확정된 net만 매출로 계산하고 pending/reversed는 제외한다. 미연결(null)과 조회 후 이벤트 0건(0)을 구별한다.

## 오케스트레이터 후속 처리와 완료 기준

1. 관리자 메뉴 신규 생성 전에 config/admin-menu-audience-policy.json에서 대상 분류를 확정한다.
2. 인증/권한/워크스페이스 멤버십/CSRF/감사영수증을 API에서 검증한다. 교차 사이트 접근은 차단한다.
3. CRM, Proposal Studio, Revenue Ledger가 각자 진실 원천으로 유지되게 계약을 연결하고 PII를 재복제하지 않는다.
4. 승인된 상품 버전, 원본 이벤트 ID, 제안서 버전, 계약/매출 참조를 관리한다.
5. 개인정보, 멱등성, 중복 매출, 한국어 반응형 (320/390/768/1366/1440), 접근 거부 등 회귀 테스트를 추가한다.
6. 정식 EKODI Orchestrator 승인 영수증, 보호된 PR/CI, 스테이징/배포, 운영 URL 및 관리자 권한별 실증이 확보되기 전에는 운영 완료로 보고하지 않는다.

이 단계에서는 사용자 DB 변경, 메일 발송, 광고, 가격 변경, 금전 결제, 계약 체결, 새 관리자 경로 개설을 하지 않는다.
