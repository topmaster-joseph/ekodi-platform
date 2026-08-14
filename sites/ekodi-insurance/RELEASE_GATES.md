# EKODI Insurance · Production Release Gates

`staging/insurance-d1-free-20260815`는 에코디몰의 지속가능한 운영방식을 보험서비스에 맞게 단순화한 Release Candidate다.

## 기본 아키텍처

- 고객 UI: Cloudflare Worker static assets
- 상담 API: Cloudflare Worker
- 상담대기열: 전용 Cloudflare D1
- 로그인 확인: 기존 Google/Supabase Auth를 필요할 때 사용자 확인용으로만 사용
- 고객 보험목록·청구메모: 기본 브라우저 로컬
- 실제 설계사 연결요청: 명시적 동의 후 D1에 최소정보만 저장
- 연락처·공유대화: AES-GCM 암호화
- 관리자: `admin.ekodi.kr → api.ekodi.kr → Insurance Worker → D1`
- 배포: GitHub Actions validate → isolated staging D1 → E2E → blue-green production

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
- 일반화된 상담요약
- 명시적 공유동의가 있는 경우에만 암호화 상담대화
- 관리자 열람·상태변경 감사로그

## 현재 staging

- UI: `https://ekodi-insurance-staging.topmaster-joseph.workers.dev`
- API: `https://insurance-api-staging.ekodi.kr`
- D1: `ekodi-insurance-staging`

staging 암호화키는 테스트 전용이며 실제 고객 개인정보를 사용하지 않는다.

## 자동검증 필수조건

1. UI/Worker JS syntax 및 기존 보험업무 경계 검사
2. 모든 D1 migration을 로컬 SQLite에 순서대로 적용
3. 금지된 민감정보 원장 테이블 부재 확인
4. `ekodi-insurance-staging` D1 resolve/create
5. remote D1 migration 적용
6. staging Insurance API 배포
7. 테스트용 AES-GCM key/internal token 설치
8. `/health`에서 D1·암호화 준비상태 확인
9. 무료 상담엔진 응답이 서버에 대화기록을 영구저장하지 않는지 확인
10. 합성 연락처로 상담요청 생성
11. Admin list에서 연락처 원문이 노출되지 않는지 확인
12. Admin detail에서 권한 있는 내부요청만 복호화되는지 확인
13. 상담상태 변경 감사흐름 확인
14. 고객 취소토큰으로 상담요청 철회 및 암호문 제거 확인
15. 합성 staging 데이터 삭제

## 운영 전 남은 게이트

### 1. Production secrets

Cloudflare Worker secret으로 준비한다.

- `INSURANCE_DATA_KEY`: 32-byte AES-GCM key
- `INSURANCE_INTERNAL_TOKEN`: 중앙 Admin proxy ↔ Insurance API
- `RATE_LIMIT_SALT`: 익명 rate-limit fingerprint salt

프런트엔드·GitHub 소스·D1 평문에는 넣지 않는다.

### 2. Central Admin staging

- 기존 중앙 관리자 세션 검증
- `Insurance > Consultations` 목록
- 연락처 힌트 + 일반화 요약만 목록에 표시
- 상세보기 시에만 복호화
- 상태 `신규 / 확인중 / 연락완료 / 종료`
- 열람·상태변경 audit 확인
- 고객 전체 보험·청구 원장을 조회하는 endpoint가 없는지 재검증

### 3. Compliance / Privacy review

운영 공개 전 서비스 브랜드, 보험모집 관련 표현, AI 상담범위, 설계사 연결 문구, 동의문, 개인정보 처리방침을 보험사 내부 컴플라이언스 및 필요한 개인정보/법률 검토 대상으로 둔다.

### 4. Blue-Green production cutover

1. `ekodi-insurance` production D1을 별도로 준비
2. migration 적용
3. Insurance API Green 배포
4. production secrets 연결
5. 합성데이터 E2E
6. 고객 UI Green 배포
7. 중앙 Admin proxy Green 연결
8. `ins.ekodi.kr` 단계 전환
9. 로그인·AI상담·설계사 연결·Admin Queue·취소 흐름 smoke test
10. 이상 시 이전 route로 즉시 rollback

## 자동승격 금지 조건

- CI 실패
- 연락처 평문 D1 저장 가능
- 공유동의 없는 대화 저장 가능
- 관리자 목록에서 연락처 원문 노출
- 고객 보험·청구 원장 서버저장 기능 추가
- 내부 Admin token 브라우저 노출
- 상담 취소 시 암호문 삭제 실패
- 보험 모집/광고/개인정보 문구 검토 미완료

## 현재 상태

**Paid Supabase branch requirement: REMOVED**

**Mall-style Cloudflare Worker + D1 architecture: ADOPTED**

**Production main / `ins.ekodi.kr`: NOT CHANGED until staging gates pass**
