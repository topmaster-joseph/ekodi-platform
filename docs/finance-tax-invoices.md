# EKODI Finance 전자세금계산서

## 목표

`admin.ekodi.kr → 결제 · 회계 → 전자세금계산서`에서 세금계산서 초안 작성, 관리자 승인, 발행정보 준비, 발행완료 기록, 국세청 승인번호 보관을 한 흐름으로 운영한다.

기본 운영원칙은 **FREE-FIRST**다.

- 기본 발행경로는 홈택스 직접발행이다.
- 에코디는 거래처, 품목, 금액, 세액, 승인, 발행이력과 감사기록을 관리한다.
- 초기·소규모 운영에서는 월 기본료나 건당 API 비용이 생기지 않도록 외부 유료 발행 API를 사용하지 않는다.
- 외부 자동발행 어댑터는 미리 구축해 두되 기본값으로 활성화하지 않는다.
- 사용량이 증가해 자동화 비용보다 인건비·운영비 절감효과가 커질 때만 명시적으로 자동화 모드를 켠다.
- 실제 발행은 무료·유료 경로 모두 사람의 승인 이후에만 가능하다.
- 외부 공급자 장애나 계약 종료가 에코디 Finance 자체의 중단으로 이어지지 않아야 한다.

## 무료 기본 흐름

`DRAFT → APPROVED → 홈택스 직접발행 → ISSUED → NTS_CONFIRMED`

관리자는 승인된 세금계산서에서 다음 기능을 사용한다.

1. `정보 복사`: 홈택스 입력에 필요한 공급자·공급받는자·품목·공급가액·세액을 한 번에 복사한다.
2. `홈택스 열기`: 국세청 홈택스를 새 창으로 연다.
3. 홈택스에서 직접 발행한다.
4. `발행완료 기록`: 에코디 내부 원장에 완료상태와 국세청 승인번호를 기록한다.

국세청 승인번호를 아직 확인하지 못한 경우 `ISSUED`로 기록하고, 승인번호를 입력하면 `NTS_CONFIRMED`로 기록한다.

## 데이터 구조

- `finance_tax_profiles`: 공급자 법적 사업자 정보
- `finance_tax_customers`: 거래처 마스터
- `finance_tax_invoices`: 세금계산서 원장과 공급자/공급받는자/품목 스냅샷
- `finance_tax_invoice_events`: 승인·발행·동기화 상태변경 기록

수동 홈택스 발행 건은 `provider=HOMETAX_MANUAL`로 기록한다.

## 선택적 자동발행 구조

향후 사용량 증가에 대비해 Popbill 자동발행 어댑터를 유지한다. 자동화는 API 키가 존재하는 것만으로 켜지지 않는다.

다음 세 조건이 모두 충족되어야 유료 자동발행이 가능하다.

1. `TAX_INVOICE_AUTOMATION_ENABLED=true`
2. Popbill LinkID/SecretKey 등 공급자 인증정보가 Worker Secret에 설정됨
3. 운영 환경에서는 `TAX_INVOICE_LIVE_ENABLED=true`

따라서 운영 서버에 API 키가 남아 있더라도 `TAX_INVOICE_AUTOMATION_ENABLED`를 명시적으로 켜지 않으면 API 발행 요청은 차단된다.

## Popbill 자동화 환경변수

아래 값은 공개 저장소, 브라우저, D1에 저장하지 않고 Cloudflare Worker Secret/환경변수로만 관리한다.

- `TAX_INVOICE_AUTOMATION_ENABLED`: 기본 미설정/false. 유료 API 자동발행을 선택할 때만 `true`
- `POPBILL_LINK_ID`: 팝빌 LinkID
- `POPBILL_SECRET_KEY`: 팝빌 SecretKey
- `POPBILL_CORP_NUM`: 팝빌 회원 사업자번호 10자리
- `POPBILL_USER_ID`: 선택. 팝빌 회원 아이디
- `POPBILL_FORWARDED_IP`: 선택
- `TAX_INVOICE_ENV`: Sandbox/production 선택
- `TAX_INVOICE_LIVE_ENABLED`: production 실제 발행 최종 잠금

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
- `POST /api/finance/tax-invoices/:id/manual-issued`
- `POST /api/finance/tax-invoices/:id/issue`
- `POST /api/finance/tax-invoices/:id/sync`

`/manual-issued`는 무료 홈택스 직접발행 완료를 내부 원장에 기록한다. `/issue`는 유료 자동발행 경로이며 FREE-FIRST 정책상 별도 자동화 스위치가 켜진 경우에만 사용할 수 있다.

## 단계별 확장

### 단계 1 · 무료 기본

- 에코디 내부 원장/거래처/품목 자동화
- 홈택스 직접 발행
- 월 고정비 0원을 우선

### 단계 2 · 반자동

- 홈택스 입력자료 복사/내보내기 강화
- 반복 거래처 자동완성
- 발행대기·기한 알림
- 여전히 최종 홈택스 발행은 무료 경로 유지

### 단계 3 · 선택적 유료 자동화

발행량 증가, 반복업무 시간, 오류율 등을 기준으로 API 비용보다 자동화 편익이 커졌을 때만 Popbill 등 외부 공급자를 켠다. 공급자를 교체해도 에코디 내부 원장과 UI는 그대로 유지한다.

## 장애 시 동작

유료 API 공급자가 장애, 가격변경, 계약종료 또는 서비스중단 상태가 되어도 에코디 Finance는 홈택스 직접발행 경로로 즉시 운영할 수 있어야 한다. 거래처, 초안, 승인, 발행대장, 감사기록은 외부 공급자와 독립적으로 보존한다.
