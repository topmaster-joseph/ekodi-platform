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


## 도매매 setOrder 4.3 ‘회원 오류’ 대응 (2026-10-29)

- 업체 회신: `techsupport@ggook.com`은 `mode`, `ver`, `aid` 등 실제 요청 파라미터와 전체 Response를 요청했다. **원인은 아직 공급사에 의해 확정되지 않았다.**
- 공식 API 규약: 구매용 Private API 키(`aid`)는 요청 회원 `id`에 발급된 것이어야 하며, `sId`는 같은 계정의 `setLogin v4.1`에서 얻어야 한다. API 키가 승인된 계정과 로그인 계정이 다른지 운영자가 **보안 저장소에서만** 확인한다.
- `api/domeggook-order.js`: 공급사 `result` 오류 문자열(HTTP 200의 `회원 오류` 포함)을 보존하고, 주문 실패 시 `supplier_connector_checks`의 `probe:setOrder`에 **비밀값 없는** 진단만 남긴다. 같은 실행에서 인증 오류가 나면 후속 주문을 중단하고 실패 주문을 자동 재시도하지 않는다.
- `getMyAsset`에서 잔액을 확인할 수 없거나 API 오류가 나오면 발주를 **차단**한다. 주문 POST의 3xx 리다이렉트를 따라가지 않고 공식 `www.domeggook.com` 엔드포인트만 호출한다.
- 보안: `aid`, `sId`, 비밀번호, 배송정보, 전체 API 요청/응답은 DB·로그·메일에 복사하지 않는다. 업체 지원에 원문이 꼭 필요할 경우 자격증명 노출 범위를 따져 공식 보안 전달 경로를 정하고, 노출된 키/세션은 회전한다.
- 검증: 실제 과금되는 `setOrder`를 단순 연결 점검으로 호출하지 않는다. `DOMEGGOOK_AUTO_ORDER_ENABLED`는 준비 요건과 소액 파일럿 검증을 충족하기 전까지 OFF로 유지한다.

### 운영자 순서

1. Private API 관리에서 해당 구매용 API 키를 발급한 회원 계정과 활성 권한을 확인한다. 개인용 승인 메일과 에코디비즈 메일을 **같은 계정 승인으로 가정하지 않는다.**
2. Cloudflare Worker secret의 `DOMEMAE_USER_ID` / `DOMEMAE_PASSWORD` / `DOMEMAE_API_KEY`가 동일한 공식 도매꾹 계정에 속하는지 별도 확인한다. 민감값을 GitHub 이슈나 이메일에 붙여넣지 않는다.
3. 비결제 점검: `setLogin` → `getMyAsset` → `getItemView` 순으로 상태만 확인한다. 에러가 발생하면 날짜·API 모드·응답 오류코드·익명화된 안전 진단을 수집한다.
4. 자동발주 실행은 차단한 채 `supplier_connector_checks` `probe:setOrder`, `supplier_orders.last_error`를 확인하여 인증/형식 문제를 구분한다.
5. 주문 권한·공급계약·개인정보 처리권한·고객 결제/취소 원장·중복 방지까지 검증한 뒤 제한된 소액 파일럿을 인적 승인하에 진행한다.
