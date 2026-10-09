# EKODI 동행 — 크리스천 싱글 공동체·교제·결혼 통합 MVP
> task_id: singles-mvp-blueprint-20261009
> status: proposed; documentation/contract only; not deployed or accepting members
> source of truth: EKODI Core identity/authorization, Constitution v1.27.1, 21 Supreme Attributes, AI Mission Governance
> scope: /singles public and authenticated experience; NO modifications to /connect or existing community data in this phase

## 0. 결정과 경계
- 목적: 신앙적 교제·공동체 참여·결혼 목적의 자발적 연결. 결혼을 기본 목표로 강요하지 않는다.
- 한국 거주 만 19세 이상, 가입·프로필 공개·종교/신념 정보 처리·결혼 추천에 대해 각각 독립적으로 동의한다.
- 출시 모델: 무료 기본 참여/대화/모임. 유료 맞선 알선/중개, 국제결혼 매칭, 개인 신앙등급/교회 추천 보증은 출시 금지; 법적 사전 검토 필요.
- 교회 또는 목회자 인증은 선택이고, 타인에게 신앙정보·메시지·교제 이력을 자동 공유하지 않는다.
- 초기 추천은 사용자가 선택한 목적과 공개 설정을 바탕으로 설명 가능한 결정적 규칙만 사용하며 외부 AI Provider에 신앙 데이터 전송 금지.
- 기존 EKODI Connect(community_connect_*)의 코드/패턴/감사·안전 개념을 재사용하되 사용자 데이터 및 접근 목적이 섞이지 않도록 'singles' 전용 저장·서비스 경계로 분리. 일반 Connect의 marriage 플래그를 가입 동의로 간주하지 않는다.

## 1. URL·메뉴·로그인 복귀
| 사용자 메뉴 | 경로 | 접근 |
| --- | --- | --- |
| 처음 | /singles | 공개 소개, 공개 행사 |
| 동행 찾기 | /singles/discover | 로그인+성인확인+동의+발견 허용 |
| 우리 모임 | /singles/groups | 공개 카드; 신청은 가입 |
| 행사 | /singles/events | 공개 카드; 신청은 가입 |
| 메시지 | /singles/messages | 상호동의한 당사자 |
| 나의 동행 | /singles/my | 본인만 |
| 운영관리 | /singles/admin | singles 운영 capability 보유자 |
- canonical host: ekodi.kr; trailing slash 유무 동일; 권한 판단은 path가 아닌 EKODI Core Person+Workspace+Role+Capability.
- '/singles'는 신규 경로이므로 PLATFORM_ROUTE_REGISTRY와 사이트 라우터 등록 및 회귀 테스트가 필수. 현재 등록된 활성 경로라고 주장하지 않는다.
- 인증은 공통 EKODI Google/Auth; 로그인 이후 원래 방문한 singles URL로 안전하게 복귀(신뢰된 allowlist, URL에 일회성 credential 노출 금지).
- 인증된 관리자도 기본 UI는 사용자와 동일하며 허용된 행동만 기능 메뉴에 추가.

## 2. 사용자 여정
1. 방문자: 서비스 소개/비식별 모임 정보/안전 약속/로그인.
2. 가입자: 본인 인증, 만 19세 이상 검증(가능하면 검증 결과만 저장; 신분증 원본 미보관), 별도 개인정보 및 민감정보 처리 동의.
3. 의도 선택: 공동체, 진지한 교제, 결혼(복수 선택 가능). 결혼 추천은 별도 opt-in.
4. 비공개 프로필 작성 -> 공개 카드 최소 항목 preview -> 본인이 공개 버튼 클릭.
5. 추천: 같은 목적, 공개 상태, 차단 이력, 지역 광역단위 및 기본 선호; 자동으로 성격/신앙 성숙도 점수화 금지.
6. 관심 전송/철회, 상대의 독립적 동의, 상호 연결 생성.
7. 메시지: 상호 활성 연결 확인 후에만 1:1 메시지; 차단/철회/정지 시 즉시 송수신 제한.
8. 모임: 공개 보기 → 신청 → 주최자 승인(옵션) → 참석; 정확한 위치/연락처는 승인된 참가자에게만.
9. 신고: 즉시 차단/숨김, 신뢰·안전 담당자 분리 검토; 관리자 임의 DM 열람 금지.
10. 탈퇴: 발견 즉시 끄기·관심/연결 종료·연결된 프로필/메시지 삭제 정책 집행; 보존 의무가 있는 증거만 법적 목적 분리.

## 3. 권한 행렬
| Capability | 방문자 | 회원(미동의) | 동의한 싱글회원 | 모임주최 | 안전담당 | 로컬운영관리자 | 플랫폼관리자 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 공개 소개·행사 읽기 | R | R | R | R | R | R | R |
| 내 프로필·동의 작성/철회 | - | 가입 동의 | 본인 | 본인 | 본인 | 본인 | 본인 |
| 타인 공개 카드 읽기 | - | - | 공개+차단검사 | 동일 | 기본 불가 | 기본 불가 | 기본 불가 |
| 관심/대화 | - | - | 상호동의+본인 | 상호동의+본인 | - | - | - |
| 모임 등록/수정 | - | - | - | 해당 모임 | - | 승인 범위 | - |
| 신고 검토·제한 | - | - | 신고만 | 신고만 | 할당건·최소 증거 | 감사/승인 | 기본 자동 부여 금지 |
| 시스템설정·감사 | - | - | - | - | - | 로컬 scope | 명시적 플랫폼 관리 컨텍스트 |
- 모든 권한은 서버에서 EKODI Core membership/capability 확인; 클라이언트 UI 숨김만으로 보호하지 않는다.
- 운영자·목회자·교회는 신앙정보 또는 메시지 내용을 자동 열람할 권한이 없다.

## 4. 데이터 계약 (신규, 설계 단계)
Core 재사용: people, login_identities, 기존 auth.users 연결, 공통 이벤트·감사, 감사/알림 어댑터.
동일 목적이 아닌 데이터 결합 금지. 싱글 서비스에서 별도 소유하는 제안 테이블:
| 테이블 | 핵심 필드 | 권한·보존 |
| --- | --- | --- |
| singles_memberships | id, workspace_id, person_id, auth_user_id, status, adult_verified_at, consent_version, consented_at, withdrawn_at | 가입자+허용된 안전 워커 |
| singles_sensitive_profiles | membership_id, faith_answers_minimal, relationship_intents, broad_region, preferences, special_consent_at, updated_at | 본인 전용, 암호화/비공개, 기본 공개 금지 |
| singles_public_cards | membership_id, pseudonym, approximate_region, approved_intro, opted_in_at, visibility | 필수 필드만 추천 서비스가 투영 |
| singles_groups | id, workspace_id, host_member_id, name, overview, visibility, status | 공개 안전 카드, 회원별 모임 접근 |
| singles_group_members | group_id, membership_id, role, status | 참가자·주최자·안전권한 |
| singles_events | id, group_id, host_member_id, title, starts_at, published_location_region, private_location, capacity, status | 위치 정확도 분리 |
| singles_event_rsvps | event_id, membership_id, status | 신청자·주최자 |
| singles_interests | from_membership_id, to_membership_id, intent, status, created_at | 당사자 + 서비스 내부 전용 |
| singles_matches | id, member_a_id, member_b_id, intent, status, closed_at | 정규화 쌍 unique, 당사자만 |
| singles_blocks | blocker_membership_id, blocked_membership_id, created_at | 서버에서 양방향 발견/전송 배제 |
| singles_reports | id, reporter_membership_id, accused_membership_id, category, evidence_ref, status | 할당된 안전 담당자만, 접근 감사 |
| singles_audit | id, actor_person_id, workspace_id, action, subject_ref, timestamp | 개인정보 본문·신앙 상세·원문 DM 로깅 금지 |
- 채팅은 독립 message DB 중복 구축보다 EKODI Messenger의 목적-격리 conversation adapter 사용 가능성을 먼저 실증. 데이터/권한 분리가 불가능할 때에만 singles_conversations/messages 채택.
- 관계/신앙 데이터는 일반 community_connect_*에 자동 미러링하지 않는다. Core의 인증 PK가 여러 identity에 매달려 있는 경우 신뢰 가능한 person_id 해석을 거쳐야 한다.
- 신앙정보 민감정보 별도 동의, 수집 최소화, 목적 외 사용 금지, 철회 후 접근차단/삭제. 정확한 보존기간과 동의 문안은 정식 개인정보 정책 검토 후 확정한다.
- 서버 API/service-role만 접근, 노출 스키마는 RLS 필수, anon/authenticated 일반 테이블 직접 권한은 기본 revoke, 필드 단위 projection만 응답. secret key 브라우저 금지.

## 5. 서버 API 초안
- GET /singles/api/public : 공개 통계가 아닌 소개·모임 정보, PII 없음.
- GET/PUT /singles/api/me : 본인 프로필·동의·공개 설정. POST /singles/api/withdraw.
- GET /singles/api/discover : 서버 동의·성인·차단 확인 후 최소 공개 카드와 추천 근거 반환.
- POST /singles/api/interests/:member_id, DELETE /singles/api/interests/:member_id : 상호 동의/철회 원자적 처리.
- GET /singles/api/matches : 당사자만.
- GET/POST /singles/api/conversations/:match_id/messages : 활성 상호 연결 확인, 속도 제한, 본인만.
- GET/POST /singles/api/groups /singles/api/events : 공개 목록과 주최자 scoped mutation 분리.
- POST /singles/api/blocks, POST /singles/api/reports : 즉시 효력, 최소 증거.
- GET /singles/api/admin/reports : 별도 안전 capability, 제한된 감사 로그.
- 모든 변경 API: 401/403/409/429 표준 오류, CSRF/Origin 방어(쿠키 방식일 때), idempotency key, rate limiting, audit id.

## 6. 보안·운영·사회적 가드레일
- 원칙: 필수 공개 0 / discovery off / 외부 검색·인덱스에 개인 프로필 노출 금지 / 연령 19세 이상 / 비밀 정보 로그 배제.
- 신고와 차단은 자기보호 도구. 보고건의 필요 최소 범위만 안전 담당자에게 공개하고 일반 관리자에게 DM 임의조회 기능 제공 금지.
- 사회관계 조작, 결혼 성사율 보장, 종교적 권위/AI의 영적 판단, 친밀감 유도 다크패턴 금지.
- 법률: 대한민국 개인정보 보호법 제23조 별도 동의 필요 여부 검토. 결혼중개업법상 유료 결혼중개업 해당 여부, 신고·등록·계약 의무 확인 전 유료 중개 비활성.
- Abuse: 가입·관심·메시지·행사신청 속도 제한, 익명/봇 방지, 운영자 최소권한·이중확인, 긴급신고 경로, 감사 로그.
- 사용자가 공개한 종교적 답변을 외부 LLM에 보내지 않는다. v1 결정형 추천이 AI Provider 장애와 무관하게 동작.
- D1 vs Supabase: 신규 관계·민감정보 canonical store는 RLS/목적 경계가 있는 Supabase로 설계; edge rate limit/캐시에는 PII 저장 금지. 실 운용 책임·복구 계획 별도 명시.

## 7. MVP 단계 / Done
**M0 계약·법률·데이터 경계**: 이 문서+계약검사, Core identity 연동 설계, DB ERD/운영 정책 검토. No runtime deployment.
**M1 공개+온보딩**: /singles, /singles/my, 인증 복귀, 성인확인, 동의 기록/철회/비공개. staging E2E.
**M2 연결**: 공개 카드, 관심/거절/차단, 상호매치, 메시지, 신고. 유료·AI 민감 추천 off.
**M3 모임**: groups/events, 주최자 승인, 참가자 권한, 안내·안전 운영.
**M4 파일럿**: 제한된 지역·성인 자발 참여, 권한침해/차단/탈퇴/모바일 E2E, 모니터링·로드 및 429/1027 대응, 중앙 Gate 배포와 실제 도메인 기능 확인.

검수 시나리오:
1) 익명 사용자는 프로필/매치/메시지/정확한 모임 위치 조회 불가.
2) 로그인이 있어도 별도 동의/성인확인 전엔 discovery 접근 불가.
3) discovery=false 사용자는 타 사용자에게 나오지 않음.
4) 관심 한쪽만으로 채팅/연락처 열리지 않음.
5) 양측 동의 뒤 대화 시작, 한쪽 철회/차단 후 즉시 전송 거부.
6) 주최자 A는 타 모임 B 참가자 개인정보 접근 불가.
7) 일반 관리자도 DM 원문을 일괄 조회할 수 없음.
8) 민감정보 동의 철회 시 자동 추천·노출·처리 정지.
9) 구글 로그인 복귀는 /singles/my, 일회성 credential URL 노출 없음.
10) /singles와 /singles/ 동일. 320/390/768/1366/1440px UI 접근성.
11) 장애 시 외부 모델 호출 없이 추천, provider failover가 정보 경계 위반하지 않음.
12) 기존 /connect /community /ekodichurch /my 동작 회귀 테스트.

## 8. 릴리스 및 승인 게이트
- 이 단계는 산출물/계약 문서만; DB 생성·실회원 노출·배포 없음.
- 이후 분리 브랜치 → 최소 migration + explicit grants/RLS → 단위/권한/보안/E2E → staging → guarded PR → 운영 canary. 운영 실증 전 완료 선언 금지.
- 예산 결제/유료 중개, 본인인증 제공업체 계약, 외부 개인정보 전송, 동의문안 최종 확정, 미성년 대상 확대 등은 별도 인권/법무/운영 승인 필요.
- 회귀 및 위험: 기존 Connect 경로와 별개의 /singles route 추가 시 플랫폼 라우팅 헌법·tenant isolation 점검을 먼저 수행.
- 롤백: 새 경로와 feature flag를 off, 신규 데이터는 즉시 임의 삭제하지 않고 개인정보 약속/법적 의무 기준으로 처리.


## 9. 2026-10-09 운영원칙 변경: 신뢰 기반 만남, 결혼중개 서비스 아님
- EKODI는 성인 본인확인, 동의 기반 공개 카드, 자발적 관심 표현, 상호 동의 후 무료 메시지, 공개 행사와 안전 대응을 위한 기술 공간만 제공한다.
- 운영자나 AI는 결혼 상대를 지정하거나 특정인과의 결혼을 알선·보증하지 않는다. 실질적인 관계의 시작·진행·종료는 각자의 선택과 책임이다. 단, 신고·괴롭힘·사기 등에 대한 플랫폼의 법률상 의무와 안전 조치를 면제한다는 뜻은 아니다.
- 무료: 소개, 프로필, 로그인 후 공개 행사 목록/상세, 동행 찾기, 관심 보내기, 상호 동의·거절, 양방향 메시지·답장, 차단·신고·탈퇴.
- 기본 행사 참가 신청: 별도 \`community\` 구독 확인 필요. 구독 혜택은 모임 운영 참여에 한정하며 특정 결혼 상대를 소개하는 대가가 아니다.
- 추가 컨설팅: \`consulting\` 별도 선택 상품. 범위는 일반적인 대화, 공동체 참여, 개인 성장 지원만 가능하며 특정 결혼 상대를 위한 조언·상담·알선은 제공하지 않는다.
- 결제수단은 온라인 계좌이체만. 카드·PG·자동결제·자동갱신 없음. 회원이 주문을 생성하면 \`EDH-<128-bit random>\` 고유번호가 발급된다.
- 동일 고유번호에 대한 3단계 검증: (1) 회원의 실제 이체 후 입금신고 (2) 결제관리자 은행 명세 확인·승인/반려 (3) 회원 승인 결과 확인 체크.
- **회원의 신고, 화면 입력 또는 관리자 단독 임의 값만으로 권한이 자동 발생하지 않음**: 서버 전용 DB 원자적 확인 함수가 올바른 상태와 별도 운영권한·은행 명세 거래번호를 검증한 뒤 해당 요금제만 연장한다. 고유번호 재승인·은행 거래번호 재사용은 거부한다.
- 운영자는 \`singles_bank_operators\`에서 권한을 받은 경우만 조회. \`can_verify\`는 은행 거래 확인, \`can_configure\`는 입금 계좌/요금 설정이며 독립 권한. 계좌·요금 변경 시 실제 결제 접수는 강제로 다시 비활성화된다.
- DB 원장: \`singles_bank_orders\`, \`singles_bank_grants\`, \`singles_bank_audit\`, \`singles_bank_settings_audit\`. 직접 anon/authenticated SELECT/INSERT/UPDATE 금지, RLS 활성. 사용자 조회는 자신의 주문만. 운영자는 고유번호로만 권한 범위 조회.
- 운영 계좌, 요금, 운영자, 서비스 출시 플래그는 현재 미설정·미활성화 상태. 외부 은행 API로 자동 입금 확인했다고 주장하지 않으며, 수동 대조만 지원한다.
- **법률 경계**: 현행 결혼중개업법 제2조는 유료 결혼 목적 상담·알선을 결혼중개업으로 볼 수 있으므로 서비스 명칭보다 실제 운영 방식이 중요하다. 유료 연결대가·개별 결혼상담·결혼 성사 보증·소개 수수료 금지. 개통 전 법무/개인정보 문안 심사 필수.
- 기존 M0~M4 계획과 기본 OFF, 교회/목회자 사적 열람 금지 원칙은 유지한다.
