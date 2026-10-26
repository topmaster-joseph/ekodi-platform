
# EKODI Orchestrator — 비용·인프라 관리 (EKODI-INFRA-COST-20261026)

## 사용자 진입점
- 최고관리자: `https://ekodi.kr/admin/finance/infra-costs`
- 플랫폼 최고관리자만 접근; 작업은 `super_admin` 세션으로 서버에서 재검증
- 기존 `/admin/finance/api-cost`(AI/API 이용량) 및 도메인 관제 메뉴는 유지

## 통합 청구 원장
- 공급자: Cloudflare, Supabase, GitHub, 도메인클럽, 도메쿡, Google Workspace/Cloud, OpenAI, Anthropic, 기타
- D1 사설 테이블: `infra_cost_invoices`, `infra_cost_budgets`, `infra_cost_renewals`, `infra_cost_audit`
- 실제 청구금액(통화별), 납부 확인 상태, 증빙 참조, 월 예산 및 80% 경고, 도메인·계약 갱신 예정일
- 고유키 `(provider, invoice_number)`으로 동일 청구서 중복 등록 방지
- 변경은 최고관리자 역할 확인 후 감사기록 기록; 카드/결제/도메인 갱신 실행 기능 없음
- `unverified`는 미납도 납부도 의미하지 않음. 청구서 존재와 결제 확인을 혼동하지 않는다.
- 과거 사용자가 제공한 Cloudflare 청구서 2건만 근거/결제 미확인으로 최초 등록 (중복 없이)
  - IN-81128159 / 2026-09-27 / USD 4.67
  - IN-85591032 / 2026-10-25 / USD 5.00

## 사용량 데이터 범위
- 기존 `provider_quota_snapshots`에 저장된 관측값만 계측으로 표시
- 요금·납부액은 사용량으로부터 추정 생성하지 않음
- Cloudflare의 Zone Analytics는 Workers 과금 지표와 구분해야 한다.
- Supabase, GitHub, 도메인 업체 등 청구서를 읽어 오는 공급자별 결제 API는 **아직 연결되지 않음**. 화면의 '자동 사용량 연동 필요'는 정상적인 미연동 상태.
- 향후 청구서 자동 수집 시에는 공식 API 또는 사용자가 명시적으로 연결한 청구 메일/문서 보관소의 증빙을 검증한 뒤, `provider+invoice_number` 중복 검사를 통과한 레코드를 검토 대기 상태로 등록한다.
- 비공개 PDF 원본 파일 업로드/검색은 이 작업 범위에 포함하지 않음. `evidence_ref`는 내부 증빙 참조값만 보관한다.

## 데이터·보안 원칙
- 임의 외부 제공업체의 비밀번호, API Token, 결제수단 정보를 브라우저/DB에 받거나 저장하지 않음
- 인증은 EKODI 세션 기반, `super_admin`을 **서버**에서 요구하고 UI 메뉴 노출을 권한 증거로 사용하지 않음
- 쓰기는 POST/PATCH JSON, Origin 제한, 입력 형식 검사 및 감사기록
- 통화 환산을 가정하여 통합 숫자로 꾸미지 않음; USD/KRW 등 통화별 원장 보존
- 타 조직/고객사 개별 청구 자료를 글로벌 공통 정책으로 승격하지 않음

## 검증 및 릴리스
- `npm run check`, `npm test`, `npm run build`, Orchestrator 필수 게이트
- 최고관리자/비관리자/비로그인 200/403/401 확인; 결제 상태 변경과 원장 영속성, 중복 409, 갱신 등록, 모바일 화면 확인
- 실서비스 운영 배포는 중앙 오케스트레이터의 보호된 PR·CI·staging·배포·운영 검증을 통과한 경우에만 '완료'
- 현재 작업 상태: 구현 브랜치/PR 검증 중. 실서비스 작동이 입증되기 전에는 구축 완료로 표시하지 않음.
