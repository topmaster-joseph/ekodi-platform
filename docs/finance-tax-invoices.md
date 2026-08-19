# EKODI Finance 전자세금계산서

## 목표

`admin.ekodi.kr → 결제 · 회계 → 전자세금계산서`에서 세금계산서 초안 작성, 관리자 승인, 외부 발행, 국세청 전송상태 확인을 한 흐름으로 운영한다.

핵심 원칙은 다음과 같다.

- 내부 원장과 UI는 외부 공급자와 분리한다.
- 실제 발행은 반드시 사람의 `승인` 후 별도 `발행` 동작으로만 가능하다.
- API 비밀키는 Cloudflare Worker Secret으로만 보관하고 브라우저와 D1에는 저장하지 않는다.
- 외부 API가 연결되지 않아도 거래처, 초안, 승인 전 단계의 내부 업무는 계속 사용할 수 있다.
- 운영 발행은 Sandbox 검증과 법적 공급자 정보 확인 후 별도 잠금을 해제한다.

## 데이터 구조

- `finance_tax_profiles`: 공급자 법적 사업자 정보
- `finance_tax_customers`: 거래처 마스터
- `finance_tax_invoices`: 세금계산서 원장과 공급자/공급받는자/품목 스냅샷
- `finance_tax_invoice_events`: 승인·발행·동기화 상태변경 기록

상태 흐름은 다음과 같다.

`DRAFT → APPROVED → ISSUING → ISSUED → NTS_CONFIRMED`

오류나 취소는 `FAILED`, `CANCELED`로 기록한다.

## Popbill 연결 환경변수

아래 값은 저장소 파일이 아니라 Cloudflare Worker Secret/환경변수로 설정한다.

- `POPBILL_LINK_ID`: 팝빌 LinkID
- `POPBILL_SECRET_KEY`: 팝빌 SecretKey
- `POPBILL_CORP_NUM`: 팝빌 회원 사업자번호 10자리. 공급자 프로필과 다르면 발행 차단
- `POPBILL_USER_ID`: 선택. 팝빌 회원 아이디
- `POPBILL_FORWARDED_IP`: 선택. 기본값 `*`
- `TAX_INVOICE_ENV`: 기본은 Sandbox. 운영 전환 시 `production`
- `TAX_INVOICE_LIVE_ENABLED`: 운영 실제 발행을 허용할 때만 `true`

운영 환경에서는 `TAX_INVOICE_ENV=production`만으로는 실제 발행할 수 없다. `TAX_INVOICE_LIVE_ENABLED=true`가 함께 있어야 한다.

## 공급자 정보

최초 운영 전에 관리자 화면의 `공급자 정보`에서 최소 다음 값을 등록한다.

- 사업자등록번호
- 상호
- 대표자

주소, 업태, 종목, 담당자, 전화, 이메일도 실제 발행정보에 포함할 수 있다.

## API

인증된 EKODI 관리자 세션만 접근한다.

- `GET /api/finance/tax-invoices/readiness`
- `GET|PUT /api/finance/tax-profile`
- `GET|POST /api/finance/tax-customers`
- `GET|POST /api/finance/tax-invoices`
- `GET /api/finance/tax-invoices/:id`
- `POST /api/finance/tax-invoices/:id/approve`
- `POST /api/finance/tax-invoices/:id/issue`
- `POST /api/finance/tax-invoices/:id/sync`

## 배포 순서

1. `0030_finance_tax_invoices.sql` D1 마이그레이션 적용
2. 전체 테스트와 경계/보안 검증 통과
3. 관리자 정적 자산 배포
4. Finance Worker 배포
5. Sandbox API 키 연결
6. 공급자 정보 등록 및 Sandbox 발행 흐름 검증
7. 팝빌 운영 계정의 인증서 및 발행 준비상태 확인
8. 운영 Secret 연결
9. `TAX_INVOICE_ENV=production` 설정
10. 최종 사람 검토 후에만 `TAX_INVOICE_LIVE_ENABLED=true`
11. 운영 호스트에서 초안 → 승인 → 발행 → 국세청 전송완료까지 검증

## 장애 시 동작

팝빌 API 또는 인증이 실패해도 기존 Toss 결제·회계 기능은 영향을 받지 않는다. 세금계산서 외부 발행만 실패 상태로 남고, 내부 원장과 감사기록은 보존한다.
