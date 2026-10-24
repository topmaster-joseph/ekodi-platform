# EKODI Mall · 도매매/도매꾹 공식 API Connector

## 목적

일반 리테일몰을 소비자 계정으로 자동구매하는 구조 대신, 공식 공급망 API를 단계적으로 연결한다.

현재 V1은 아래까지만 허용한다.

1. 공식 provider 등록
2. 연결 준비상태 확인
3. 공식 상품번호 `getItemView` 실조회
4. 최소 상품정보만 즉시 정규화
5. 주문 Dry-run

`setOrder` 실주문 호출은 V1에 구현하지 않는다.

## 비밀정보

아래 값은 Cloudflare Worker secret로만 관리한다.

- `DOMEMAE_API_KEY`
- `DOMEMAE_USER_ID`
- `DOMEMAE_SESSION_ID`

브라우저, Git 저장소, D1, localStorage에 원문을 저장하지 않는다. 관리 UI에는 configured/missing 상태만 표시한다.

## 현재 Gate

- `DOMEMAE_LOOKUP_ENABLED=false` 기본
- provider `auto_order_enabled=0` DB 잠금
- provider `customer_pii_allowed=0` DB 잠금
- 실주문 API 코드 없음
- 구매자 PII 입력 UI 없음
- 자동발주 없음

## 상품조회 저장정책

공식 API 응답 원문 전체를 D1에 복제 저장하지 않는다. V1은 상품번호, 제목, 판매상태, 섹션/마켓 등 연결 검증에 필요한 최소값만 응답하고 connector check에는 상태성 metadata만 남긴다.

공식 API 접근권한이 상품 이미지·상세설명의 EKODI 재게시 권리까지 자동 부여한다고 가정하지 않는다. 실제 EKODI 상품화는 별도 공급계약·콘텐츠 사용권·상품 Source 검증을 통과해야 한다.

## 실주문 V2를 열기 위한 조건

다음이 모두 검증되기 전에는 `setOrder`를 추가하지 않는다.

1. 도매매/도매꾹 계정 및 API Key 준비
2. 필요한 Private API 권한 검토/승인
3. 로그인 session ID 발급·만료·재발급 lifecycle 검증
4. e-money 충전/잔액 부족/중복결제 실패 시나리오 검증
5. 실제 SKU 가격·재고 주문 직전 재검증
6. PII Vault에서 최소 배송정보만 일회성 release하는 구조 검증
7. 공급자 개인정보 처리범위와 계약 검증
8. 주문 idempotency와 재시도 정책 검증
9. 구매취소 가능 상태 및 취소 API 동기화 검증
10. 송장/배송상태 동기화 검증
11. 반품·환불·공급자 정산 원장 검증
12. 1~3개 SKU 수동 승인 소액 파일럿 완료

위 조건이 충족돼도 Auto Order는 별도 단계로 남긴다.

## 원칙

`Official API access ≠ resale right ≠ PII permission ≠ order execution permission ≠ Auto Order permission`

각 권한은 독립적으로 검증한다.

## V2 자동발주 (EKODI-MALL-DOMEGGOOK-AUTOORDER-001, 2026-10-25)

운영자 결정(2026-10-25): Private API(구매용) 승인을 전제로, **에코디몰에서 고객 결제가 완료된 위탁상품만** 자동 발주한다. 선발주는 없다.

- 코드: `api/domeggook-order.js` (cron 10분). 비밀값: `DOMEMAE_API_KEY`, `DOMEMAE_USER_ID`, `DOMEMAE_PASSWORD`(로그인 전용, 세션은 저장하지 않음).
- 게이트: `DOMEGGOOK_AUTO_ORDER_ENABLED="true"` + 위 secret 3개가 모두 있을 때만 동작.
- 안전장치: `supplier_orders.order_id` UNIQUE 멱등 / 공급처 판매상태·재고 재확인 / 역마진 차단 / 이머니 잔액 확인(부족 시 알림 후 충전되면 재시도) / 응답 불명은 재시도 금지(이중 발주 방지) / 발주 직후 getOrderView 로 품목·수량 대조, 불일치 시 즉시 setOrdDeny / 고객 환불 시 배송 전이면 자동 구매취소, 배송 후면 반품 알림.
- 배송지 정보는 발주에 필요한 최소 항목(이름·연락처·이메일·주소·배송메모)만 공급처로 전달된다. 개인정보처리방침의 제3자 제공 고지 반영은 확인필요.
- 확인필요: setOrder `item[]` 칸 의미(연동 가이드 docx). 기본 템플릿 `{market}||P||01|{qty}||{sellerMemo}||{deliMemo}` 은 문서 예시를 따른 것이며 `DOMEGGOOK_ORDER_ITEM_TEMPLATE` 로 교체 가능.
