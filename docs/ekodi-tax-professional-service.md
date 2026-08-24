# EKODI Tax 전문서비스

## 목적

`tax.ekodi.kr`은 EKODI의 세금·증빙 전문서비스다. 별도 인증서버, 별도 데이터베이스, 별도 유료 SaaS를 복제하지 않고 기존 EKODI Admin 인증과 Finance Core/D1을 공유한다.

핵심 원칙은 다음과 같다.

1. **FREE-FIRST**: 전자세금계산서의 기본 운영경로는 HomeTax 수동 발행이다.
2. **얇은 전문서비스**: Tax는 업무화면과 세금 도메인 규칙을 소유하고, 공통 인증·원장·감사로그는 EKODI Core를 재사용한다.
3. **다중 공급자**: 한 조직 안에서 여러 사업자/종사업장을 등록하고 계산서마다 공급자를 선택할 수 있다.
4. **스냅샷 보존**: 계산서에 선택된 공급자 정보를 저장하여 이후 공급자 마스터가 바뀌어도 과거 계산서가 변하지 않는다.
5. **유료 자동화는 명시적 선택**: API 키가 있어도 `TAX_INVOICE_AUTOMATION_ENABLED=true` 전에는 유료 발행이 실행되지 않는다.
6. **업무 책임 분리**: 공통 Admin Finance는 결제·회계 관제와 Tax 진입을 담당하고, 세금 상세 업무는 `tax.ekodi.kr`에서 수행한다.

## 런타임 구조

```text
사용자
  ↓
tax.ekodi.kr
  ├─ HTML/CSS/JS: tax-portal-worker.js
  └─ /api/finance/tax-*
        ↓ same-origin
platform-router-entry-worker.js
        ↓
finance-entry-worker.js
        ↓
tax-service-worker.js
        ↓
tax-invoice-free-first-worker.js
        ↓
D1 finance_* tables
```

브라우저가 `finance-api.ekodi.kr`로 직접 교차 출처 요청하지 않는다. Tax 화면은 같은 `tax.ekodi.kr`의 `/api/finance/tax-*`를 호출하고 Shared Worker가 내부적으로 Finance Core로 연결한다. 따라서 CORS 허용목록과 인증 경로가 여러 곳에 분산되지 않는다.

## 인증

Tax는 별도 사용자 계정을 만들지 않는다.

1. Tax에 EKODI 관리자 세션이 없으면 `auth.ekodi.kr`로 이동한다.
2. 중앙 Google 관리자 인증을 완료한다.
3. `auth-site/admin-auth.js`의 명시적 allowlist가 `https://tax.ekodi.kr/` 또는 `/index.html`만 return target으로 허용한다.
4. 토큰은 URL fragment로 전달되고 Tax가 `sessionStorage`에 저장한 뒤 fragment를 즉시 제거한다.

현재 첫 운영범위는 EKODI 관리자용이며 조직은 `EKODIBIZ`로 제한한다. 외부 고객에게 다중 테넌트 Tax를 개방하기 전에는 조직별 ACL을 추가해야 한다.

## 공급자 관리

`finance_tax_supplier_profiles`는 기존 `finance_tax_profiles`를 삭제하거나 변경하지 않고 추가되는 additive 테이블이다. 마이그레이션은 기존 단일 공급자 정보를 `INSERT OR IGNORE`로 초기 이관한다.

지원 기능:

- 공급자 추가
- 공급자 수정
- 기본 공급자 지정
- 공급자 보관
- 마지막 활성 공급자 보관 방지
- 사업자번호 + 종사업장번호 중복 방지
- 한 조직에 활성 기본 공급자 하나만 허용

새 공급자를 기본으로 지정할 때는 먼저 새 행을 정상 삽입하고, 성공한 뒤 기존 기본 플래그를 바꾼다. 중복이나 검증 실패로 새 공급자 등록이 실패해도 기존 기본 공급자가 풀리지 않는다.

## 전자세금계산서 흐름

```text
공급자 선택
  ↓
거래처 선택 또는 입력
  ↓
품목/공급가액/세액 입력
  ↓
DRAFT 저장
  ↓ 공급자 Snapshot 고정
관리자 검토
  ↓
APPROVED
  ↓
HomeTax에서 무료 발행
  ↓
발행완료 기록
  ├─ 승인번호 없음 → ISSUED
  └─ 승인번호 있음 → NTS_CONFIRMED
```

저장만으로 외부 발행이 발생하지 않는다. 유료 자동발행은 기존 Popbill adapter를 유지하지만 기본 OFF다.

## Tax 메뉴

- **홈**: 무료 기본채널, 공급자 수, 기본 공급자, 월 발행액, 자동화 상태
- **세금계산서**: 작성, 승인, 발행완료 기록, 상세조회
- **공급자**: 추가, 수정, 기본 지정, 보관
- **거래처**: 계산서 작성 과정에서 자동 저장/갱신된 거래처 조회
- **발행대장**: 공급자별·상태별 발행내역 필터

## Admin과의 경계

### Admin Finance

담당:
- 결제 현황
- 회계 집계
- 사업구조
- `EKODI Tax` 진입

담당하지 않음:
- 전체 생태계 Health 조회
- Tax 상세 작성 UI의 별도 복제
- Creator AI 구독 가격 관리

Finance는 메뉴 진입 또는 수동 새로고침 때만 데이터를 조회한다. 상시 `setInterval()` 폴링은 사용하지 않는다.

### Books

Creator AI의 요금과 신규 결제 활성 관리는 Books의 출판/Creator Billing 업무로 이동한다. 공통 Finance는 특정 전문서비스의 상품가격 설정을 소유하지 않는다.

## 데이터 보존

전자세금계산서의 `invoicer_json`은 발행 당시 공급자 Snapshot이다. 공급자 마스터를 나중에 수정하거나 보관해도 과거 계산서 공급자 정보는 변경되지 않는다.

공급자별 대장은 이 Snapshot의 공급자 ID를 기준으로 필터링한다.

## 확장 단계

### 1단계: 현재
- 다중 공급자
- 거래처
- 전자세금계산서
- HomeTax 무료 발행 보조
- 발행대장

### 2단계
- 매입·매출 증빙
- 카드/현금영수증 자료 연결
- CSV/Excel 내보내기

### 3단계
- 부가세 준비자료
- 세무 일정 알림
- 누락 가능성 점검

### 4단계
- 발행량과 절감시간이 비용을 정당화할 때 유료 API 자동화 활성화

AI는 세무 신고 결정을 대신하기보다 누락 가능성, 자료 정리, 검토 보조 역할부터 적용한다.

## 배포

Tax 관련 변경은 `.github/workflows/deploy-tax-invoice-routing.yml`이 검증한다.

PR 단계:
- Tax/Finance/Auth/Router JavaScript syntax
- 전문서비스 계약 테스트
- FREE-FIRST 잠금
- additive migration
- Tax 도메인 라우팅
- Admin 메뉴 경계

main 반영 후:
1. Finance guarded release 실행
2. Shared Site guarded release 실행 및 custom-domain sync
3. `finance-api.ekodi.kr/api/finance/tax-health` 검증
4. `tax.ekodi.kr` 및 `tax-portal.js` 검증
5. `deploy-status/tax-invoice.json`에 운영 검증 marker 기록

운영 검증 marker에는 `FREE_FIRST`, `HOMETAX_MANUAL`, `multiSupplier:true`, 유료 자동화 상태, Finance/Tax URL을 기록한다.
