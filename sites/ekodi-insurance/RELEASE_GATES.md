# EKODI Insurance · Production Release Gates

`staging/insurance-release-20260815`는 에코디몰의 지속가능한 운영방식을 보험서비스에 맞게 단순화한 통합 Release Candidate다.

## 기본 아키텍처

- 고객 UI: Cloudflare static assets + 필요한 경로만 Worker
- 상담 API: Cloudflare Worker
- 상담대기열: 전용 Cloudflare D1
- 로그인 확인: 기존 Google/Supabase Auth를 필요할 때 사용자 확인용으로만 사용
- 고객 보험목록·청구메모·기본 AI 대화: 브라우저 로컬
- 실제 설계사 연결요청: 연락정보 처리 필수동의 후 D1에 최소정보만 저장
- AI 상담 대화 원문: 별도 선택동의가 있을 때만 AES-GCM 암호화 저장
- 관리자: `admin.ekodi.kr → api.ekodi.kr → Insurance Worker → D1`
- 배포: GitHub Actions validate → isolated staging D1 → 실제 중앙세션 E2E → production Green → blue-green cutover

**유료 Supabase development branch는 사용하지 않는다.**

## 서버에 만들지 않는 데이터 원장

D1에는 다음 테이블을 만들지 않는다.

- 전체 보험계약 원장
- 전체 청구 원장
- 건강 프로필 원장
- 의료기록 원장
- 보험증권 이미지 저장소

사용자가 직접 정리한 보험·청구 정보는 기본적으로 브라우저에 남긴다.

## D1에 저장하는 최소정보

사용자가 실제 설계사 연락을 요청한 경우에만 저장한다.

- 상담요청 ID
- 처리상태
- 이름
- AES-GCM 암호화 연락처
- 연락처 힌트
- 비민감 범주코드에서 만든 일반화 상담요약
- **별도 선택동의가 있는 경우에만** 암호화 AI 상담대화
- 관리자 열람·상태변경 감사로그

상담요청은 기본 30일 보유 후 자동 삭제하고, rate-limit 기록은 2일 후 자동 정리한다. Cloudflare cron으로 매일 cleanup을 실행한다.

## 현재 staging

- UI: `https://ekodi-insurance-staging.topmaster-joseph.workers.dev`
- API: `https://insurance-api-staging.ekodi.kr`
- Insurance D1: `ekodi-insurance-staging`
- 중앙 세션 E2E Worker: `https://ekodi-insurance-control-staging.topmaster-joseph.workers.dev`
- 중앙 세션 E2E D1: `ekodi-insurance-control-staging`

staging은 합성데이터만 사용하며 테스트 완료 후 자동 삭제한다.

## 기술 자동검증 완료

- [x] UI/Worker JS syntax 및 보험업무 경계 검사
- [x] 모든 D1 migration을 로컬 SQLite에 순서대로 적용
- [x] 금지된 민감정보 원장 테이블 부재 확인
- [x] `ekodi-insurance-staging` D1 resolve/create
- [x] remote D1 migration 적용
- [x] staging Insurance API 배포
- [x] staging 전용 AES-GCM key/internal token/rate-limit salt 설치
- [x] `/health`에서 D1·암호화·내부관리자·rate-limit 준비상태 확인
- [x] 무료 상담엔진 `persisted:false` 확인
- [x] 연락정보 처리 동의와 AI 대화 공유 선택동의 분리
- [x] 대화 공유 OFF 시 원문 미저장 확인
- [x] 대화 공유 ON 시 암호화 저장·권한 있는 상세에서만 복호화 확인
- [x] Admin list에서 연락처 원문 비노출
- [x] 고객 취소토큰으로 상담요청 철회 및 암호문 제거
- [x] 실제 중앙 bearer 세션을 별도 D1에 생성해 중앙 Control Worker → Insurance D1 연결 확인
- [x] 비로그인 중앙 관리자 API 401 확인
- [x] 중앙 관리자 상세 열람·상태변경 및 audit 흐름 확인
- [x] 합성 staging 데이터 삭제
- [x] 운영 `customer-entry-worker.js`에 `/api/insurance/admin` 프록시 라우트 준비
- [x] 운영 `wrangler.api.toml`에 `INSURANCE_API_BASE=https://insurance-api.ekodi.kr` 준비
- [x] 30일 상담정보 자동파기 cron 코드·설정 준비

실제 중앙 세션 통합 E2E 성공 Run: `31842647201`

## 운영 전 남은 게이트

### 1. 운영주체·보험모집·Privacy 외부 검토

기술 CI가 대신 승인할 수 없는 마지막 외부 게이트다.

- 서비스 운영주체 법적 명칭
- 실제 보험상품 설명·권유를 담당할 등록된 모집자/위촉관계 표시
- `EKODI Insurance` 브랜드가 보험회사 자체 서비스로 오인되지 않도록 표시 검토
- 보험사 내부 광고·모집 컴플라이언스 확인이 필요한 문구 확정
- 개인정보 처리방침 확정
- 상담 연락정보 처리 필수동의 문구 확정
- AI 대화/건강정보 포함 가능성에 대한 별도 선택동의 문구 확정

이 검토가 완료되기 전에는 특정 보험상품 추천, 보험사 공식서비스 표방, 자동청약 기능을 활성화하지 않는다.

### 2. Production secrets 최초 1회 고정

운영 암호화키는 staging처럼 배포 때마다 회전시키면 안 된다.

- `INSURANCE_DATA_KEY`: 32-byte AES-GCM key, **운영기간 동안 안정적으로 보존**
- `INSURANCE_INTERNAL_TOKEN`: 중앙 Admin proxy ↔ Insurance API, 동시회전 가능
- `RATE_LIMIT_SALT`: 익명 rate-limit fingerprint salt

프런트엔드·소스·D1 평문에 넣지 않는다. 특히 `INSURANCE_DATA_KEY` 변경은 기존 암호문의 복호화를 불가능하게 만들 수 있으므로 운영 데이터가 있는 상태에서 자동회전하지 않는다.

### 3. Blue-Green production cutover

1. `ekodi-insurance` production D1 별도 준비
2. migration 적용
3. Insurance API Green 배포
4. 고정 production secrets 연결
5. 합성데이터 E2E
6. 고객 UI Green 배포
7. 중앙 Admin Green 연결 및 실제 운영 관리자 세션 smoke
8. `insurance-api.ekodi.kr` 및 `ins.ekodi.kr` 단계 전환
9. AI상담·설계사 연결·Admin Queue·취소 흐름 smoke
10. 이상 시 이전 route 즉시 rollback

## 자동승격 금지 조건

- CI 실패
- 연락정보 필수동의와 AI 대화 공유 선택동의가 분리되지 않음
- 대화 공유 선택동의 없이 원문 대화가 저장됨
- 연락처 평문 D1 저장 가능
- 관리자 목록에서 연락처 원문 노출
- 고객 보험·청구·건강 원장 서버저장 기능 추가
- 내부 Admin token 브라우저 노출
- 상담 취소 시 암호문 삭제 실패
- 30일 보유기간 자동파기 설정 누락
- 운영 `INSURANCE_DATA_KEY` 자동회전 가능성
- 운영주체/모집책임/보험 광고·개인정보 문구 검토 미완료

## 현재 상태

**Paid Supabase branch requirement: REMOVED**

**Mall-style Cloudflare Worker + D1 architecture: ADOPTED**

**Separate consent + real central-session staging E2E: PASS**

**Technical staging gates: PASS**

**Production `main` / `ins.ekodi.kr`: NOT CHANGED. External compliance/privacy + production-secret gates remain.**
