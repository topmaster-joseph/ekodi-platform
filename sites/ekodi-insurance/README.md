# EKODI Insurance MVP

`ins.ekodi.kr`을 위한 간단하고 지속가능한 보험관리·AI상담 플랫폼입니다.

## 운영 원칙

에코디몰과 같은 무료 중심 구조를 사용합니다.

- 정적/경량 UI + Cloudflare Worker
- 전용 Cloudflare D1
- GitHub Actions 검증 → 독립 staging → 운영 승격
- 기존 Google/Supabase 인증은 필요할 때 **사용자 확인만** 수행
- 보험 업무데이터를 Supabase Postgres에 저장하지 않음
- **유료 Supabase development branch는 사용하지 않는다.**

## 데이터 최소화

서버에 모든 보험정보를 쌓는 방식으로 만들지 않습니다.

### 브라우저에만 두는 정보
- 사용자가 직접 정리한 보험목록
- 보험료·갱신 점검 메모
- 청구 준비 메모
- AI 상담 대화의 기본 사본

### D1에 저장하는 정보
사용자가 **실제 설계사 연락을 명시적으로 요청한 경우에만** 상담대기열을 만듭니다.

- 상담요청 ID와 처리상태
- 이름
- 암호화된 연락처
- 연락처 힌트(끝 4자리 등)
- 일반화된 상담요약
- 사용자가 공유에 동의한 경우에만 암호화된 상담대화
- 관리자 열람·상태변경 감사로그

D1에는 고객의 전체 보험계약 원장, 보험증권 이미지, 상세 건강기록, 의료기록 원문을 만들지 않습니다.

## AI 상담

기본 무료모드는 외부 생성형 AI 호출에 의존하지 않는 `free-guidance-engine`입니다.

- 기존 보험 점검 순서
- 보험료 유지부담 점검
- 보험금 청구 준비
- 설계사 연결 필요 여부 안내

대화는 요청마다 처리하고 서버에 일반 대화기록으로 저장하지 않습니다. 실제 설계사 연결을 요청하고 공유에 동의한 경우에만 필요한 대화가 암호화되어 상담건에 첨부됩니다.

향후 외부 AI 모델을 추가하더라도 선택형 provider adapter로 두어, 모델 비용이 없어도 기본 보험상담·관리 흐름이 작동하도록 유지합니다.

## Human Handoff

`AI 상담 → 사용자의 명시적 설계사 연결 요청 → 연락처 암호화 → 관리자 상담대기열` 순서입니다.

관리자 목록에는 연락처 원문 대신 힌트와 상담요약만 표시합니다. 상세 화면을 권한 있는 관리자가 열 때만 Worker에서 복호화하며 열람기록을 남깁니다.

사용자에게는 상담요청 취소용 1회 권한 토큰을 브라우저에 보관하게 하며, 취소 시 D1의 연락처·공유대화 암호문을 제거합니다.

## 보안 경계

- 연락처·공유대화: AES-GCM 암호화
- 암호화키: Cloudflare Worker secret
- 중앙 Admin 연결: 내부 토큰
- CORS origin allowlist
- 시간 단위 rate limit
- 주민번호·연락처·번호정보 redaction
- D1 쿼리는 서버 Worker에서만 수행
- 관리자 브라우저에 D1 키나 내부 토큰을 노출하지 않음

## Staging

- UI: `https://ekodi-insurance-staging.topmaster-joseph.workers.dev`
- API: `https://insurance-api-staging.ekodi.kr`
- D1: `ekodi-insurance-staging`

staging은 합성 테스트데이터만 사용합니다. staging 암호화키는 배포 시 교체될 수 있으므로 실제 고객 개인정보를 넣지 않습니다.

## 운영 승격

1. 코드·D1 migration 로컬 검증
2. 독립 `ekodi-insurance-staging` D1 자동 준비
3. staging migration 적용
4. staging Worker/API 배포
5. AI chat, 암호화 handoff, 관리자 상세, 상태변경, 취소 E2E
6. 합성 테스트데이터 삭제
7. 보험·개인정보 문구 검토
8. 운영 D1/Worker를 Green으로 준비
9. smoke test 후 `ins.ekodi.kr` 단계 전환
10. 이상 시 이전 route로 rollback

자세한 법적·업무 경계는 `COMPLIANCE_GUARDRAILS.md`를 따릅니다.
