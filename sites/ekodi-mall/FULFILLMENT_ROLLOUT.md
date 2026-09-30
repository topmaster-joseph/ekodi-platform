# EKODI Mall Fulfillment Rollout

## 목표

EKODI Mall의 무재고 직배송은 일반 쇼핑몰 재구매 자동화가 아니라 **검증된 계약 공급자**를 기준으로 운영한다.

현재 V1은 주문 이행 원장과 안전 게이트를 준비하지만 실제 결제, 고객 개인정보 Release, 공급자 발주, 공급자 지급, 환불 실행은 자동으로 켜지 않는다.

## 운영 순서

1. **Source**: Seller가 Sourcing Lab에서 계약 공급자 후보와 상품을 연결한다.
2. **Contract**: 내부 검증에서 공급계약 참조, 개인정보 처리위탁 참조, 반품/CS 정책 참조를 모두 등록한다.
3. **Paid Order**: Mall의 서버 검증을 통과한 결제완료 주문만 Fulfillment 준비 대상이다.
4. **Economics Recheck**: 실제 주문의 수량, gross, 실제 플랫폼 수수료와 공급가/배송비로 최소 마진을 다시 계산한다.
5. **PII Release**: 배송정보 원문은 Mall D1에 저장하지 않는다. 별도 승인된 PII 계층이 `pii_...` 참조를 발급하고 전역 게이트가 켜져야 Release 상태로 이동한다.
6. **Supplier Forward**: 계약 공급자 수동 발주도 별도 전역 게이트가 켜져야 가능하다. 공급자 API 자동발주는 더 높은 별도 게이트다.
7. **Shipment**: 공급자 접수와 송장, 배송중, 배송완료를 순차 기록한다.
8. **Return**: V1은 배송완료 후 반품 케이스를 생성하고 승인 → 회수 → 입고 → 환불대기 → 환불기록 → 종료 순서를 강제한다.
9. **Settlement**: 공급원가 purchase/refund/adjustment 원장은 기록하되 실제 공급자 지급은 실행하지 않는다.

## 기본 OFF 게이트

- `PAYMENTS_ENABLED=false`
- `SOURCING_AUTO_ORDER_ENABLED=false`
- `BUYER_PII_RELEASE_ENABLED=false`
- `SUPPLIER_FORWARD_ENABLED=false`
- supplier payout execution = false
- refund execution = false

## 개인정보 경계

Mall D1 Fulfillment 스키마에는 구매자 이름, 전화번호, 이메일, 우편번호, 배송주소 원문 컬럼을 만들지 않는다.

향후 배송정보 계층을 연결하더라도 Mall에는 불투명한 `pii_...` 참조만 저장한다. 계약검증과 PII Release는 별도 승인이다.

## 공급계약 검증에 필요한 최소 참조

- 공급계약 문서/레코드 참조
- 개인정보 처리위탁 문서/레코드 참조
- 반품 및 CS 책임정책 참조
- CS 책임주체
- 배송 SLA
- 계약 효력일/만료일

구형 `/api/internal/sourcing/.../approve` 상태만으로는 Fulfillment가 준비되지 않는다. `supplier_contracts`에 유효한 verified 계약이 있어야 한다.

## Auto Order 승격 조건

다음이 모두 검증되기 전에는 `api_order`를 실행하지 않는다.

- 공급자의 공식 주문 API와 사용권한
- 주문 생성/취소/중복방지 idempotency 계약
- 상품 SKU와 옵션의 안정적 매핑
- 주문 직전 재고·원가 재검증
- 구매자 배송정보 처리 권한과 PII Release 계층
- 장애·재시도·부분실패 대응
- 반품/환불 상태 동기화
- 공급자 정산 및 세금 증빙 책임
- staging contract test와 production gate 승인

## 첫 실거래 파일럿

첫 공급자 1곳은 `contract_supplier + manual_forward`로 운영한다.

실제 결제가 준비된 뒤 소량 주문으로 계약 → 마진 재검증 → PII Release → 수동 발주 → 접수 → 송장 → 배송완료 → 반품 테스트 → 공급원가 원장까지 한 사이클을 검증한다. 이 사이클이 안정된 후에만 해당 공급자를 `supplier_api` 후보로 승격한다.
