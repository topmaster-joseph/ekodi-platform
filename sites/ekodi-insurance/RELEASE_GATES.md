# EKODI Insurance · Production Release Gates

`staging/insurance-release-20260815`는 코드 수준 Release Candidate다. 이 문서는 `ins.ekodi.kr` 운영 전환을 허용하는 조건을 고정한다.

## 현재 통과한 게이트

- 고객용 Cloudflare Workers 스테이징 배포
- AI-first 상담 UI 및 Human Handoff 흐름
- 상담요청 로컬 Admin preview
- Privacy Center 및 전체 로컬데이터 삭제
- 불투명한 보험점수 제거 및 분석 기준 공개
- 특정 상품 비교·추천/보험금 지급 확정 경계
- 정식 Control Center용 Insurance 상담 Queue 모듈 빌드
- Insurance customer API Deno 타입검사
- AI 입력 Redaction, 연락처 AES-GCM 암호화 코드, API-key 환경변수 사용
- 상담 공유동의, 공유철회, 관리자 열람/상태변경 감사로그 코드
- PostgreSQL 17 기반 RLS/권한 테스트
- 타 사용자 보험자료 접근 차단
- Insurance staff의 고객 전체 보험원장 직접 열람 차단
- 상담요청/동의/AI transcript의 클라이언트 직접쓰기 차단
- fail-closed Insurance Auth staging UI/Worker 배포
- Insurance Google identity staging function 타입검사
- identity challenge 저장소의 service-role only 권한 검증
- 현재 운영 Supabase 프로젝트를 Auth staging에서 명시적으로 차단
- 중앙 Admin session과 Insurance Auth를 혼합하지 않는 Control Proxy 경계
- `admin.ekodi.kr → api.ekodi.kr → insurance-admin-internal` 구조 코드 검증
- 내부 Admin API에서 고객 보험·청구 원장 endpoint 부재 검증
- 중앙 관리자 principal을 Insurance audit에 별도 기록하는 스키마
- 고객 Frontend + Auth staging + Admin + Control proxy + customer API + internal admin API + 4개 SQL 통합 Release Candidate CI

## 현재 공개된 안전한 스테이징

- 고객 앱: `https://ekodi-insurance-staging.topmaster-joseph.workers.dev`
- 로컬 상담관리 Preview: `https://ekodi-insurance-staging.topmaster-joseph.workers.dev/admin`
- 분리형 Auth shell: `https://ekodi-insurance-auth-staging.topmaster-joseph.workers.dev`

Auth shell은 실제 development branch가 연결되기 전까지 의도적으로 `environment=blocked` 상태를 유지한다.

## 운영 전 필수 미통과 게이트

### 1. 완전 분리된 Supabase Staging

운영 중앙인증 프로젝트에 테스트 데이터를 만들지 않는다.

- Supabase development branch `insurance-staging` 생성
- `001_insurance_platform.sql`
- `002_insurance_privileges.sql`
- `003_insurance_identity_staging.sql`
- `004_insurance_admin_principal.sql`
- Supabase Security Advisor와 Performance Advisor 확인
- 실제 branch에서 RLS/권한 재검증

Development branch는 시간당 과금되는 인프라라 비용 승인 후에만 생성한다.

### 2. Real Insurance Auth Staging

분리형 Auth shell과 identity function 코드는 검증됐지만 실제 Auth session은 아직 발급하지 않는다.

- development branch URL/publishable key를 Auth staging에 연결
- `insurance-identity-staging` function을 development branch에 배포
- Google OAuth에서 Auth staging Origin 허용
- Google 본인확인 → development branch staging session 교환 검증
- 보험 고객 앱이 그 세션을 정상 수신하는지 E2E 확인
- 이후 운영 중앙 Auth에 Insurance realm을 통합할 경우 Community / Mall / 기존 고객 인증 회귀검증

### 3. Backend Secrets

다음 서버 비밀값이 준비되지 않으면 실제 Handoff backend를 활성화하지 않는다.

- `INSURANCE_CONTACT_KEY`: AES-GCM 256-bit key
- `INSURANCE_INTERNAL_TOKEN`: Control API ↔ Insurance internal admin API 전용
- AI Provider를 사용할 경우 `OPENAI_API_KEY`
- `INSURANCE_OPENAI_MODEL`
- `INSURANCE_GOOGLE_CLIENT_ID`
- `INSURANCE_AUTH_ORIGIN`

비밀값을 프런트엔드, GitHub 소스, 로그에 넣지 않는다.

### 4. Real Insurance API Staging

- customer `insurance-api`를 development branch에 배포
- `insurance-admin-internal`을 development branch에 custom internal auth로 배포
- AI `/ai/chat` 인증검증
- 연락처 암호화 round-trip 확인
- 상담요청 생성/철회 확인
- 중앙 Admin proxy list/detail/status 권한 확인
- auditor 역할의 연락처 비공개 확인
- 모든 관리자 열람/상태변경 audit 확인
- 외부 AI 사용 시 실제 전송필드와 저장정책 확인

### 5. Real Admin Staging

Control Center용 Insurance 모듈과 proxy 코드는 통과했지만 운영 `admin.ekodi.kr`와 `api.ekodi.kr`에는 아직 배포하지 않는다.

- 독립 Admin/Control API staging에서 Insurance 메뉴 로드
- central admin session → Insurance internal proxy E2E
- admin/advisor/auditor 역할별 화면 검증
- 상담 Queue는 상담요청 범위만 표시
- 고객 보험·청구 원장이 메뉴나 API를 통해 노출되지 않는지 재확인

### 6. Compliance / Privacy Review

운영 공개 전에는 서비스 브랜드, 보험모집 관련 표현, AI 상담범위, 설계사 연결 문구, 동의문, 개인정보 처리방침을 보험사 내부 컴플라이언스 및 필요한 법률/개인정보 검토 대상으로 둔다.

이 Release Candidate 자체를 법적 적합성의 최종 확인으로 간주하지 않는다.

### 7. Blue-Green Production Cutover

모든 staging 게이트 통과 후에만 수행한다.

1. production Worker/API/Auth/Admin 후보를 Green으로 준비
2. 실제 운영 도메인 전환 전 smoke test
3. `ins.ekodi.kr`의 DNS/route를 Green으로 단계 전환
4. 로그인, AI 상담, 상담요청, Admin Queue, Privacy 삭제 E2E 확인
5. 장애 시 즉시 기존 route로 rollback
6. 안정화 후 이전 Blue 자원 정리

## 운영 자동승격 금지 조건

다음 중 하나라도 해당하면 자동으로 운영 전환하지 않는다.

- CI 실패
- Security Advisor 중요 경고 미해결
- RLS isolation 실패
- 상담 연락처 평문 저장 가능성
- 관리자 고객 보험원장 직접 접근 가능
- 외부 AI Provider의 전송/보존 정책 미확인
- Auth 회귀검증 실패
- 보험 모집/광고 문구 검토 미완료

## 현재 상태

**Code Release Candidate: PASS**

**Fail-closed Auth Staging Shell: PASS**

**Central Admin Proxy Boundary: PASS**

**Full No-Paid Integrated CI: PASS**

**Real isolated backend/auth staging: BLOCKED UNTIL PAID SUPABASE DEVELOPMENT BRANCH IS EXPLICITLY APPROVED**

비용 승인 전에는 운영 DB, 운영 Auth, 운영 Admin, `ins.ekodi.kr` route를 변경하지 않는다.
