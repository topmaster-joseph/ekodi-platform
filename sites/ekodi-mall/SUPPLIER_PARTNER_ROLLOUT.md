# EKODI Mall Supplier Partner Pilot

## 목적

첫 실제 직배송 공급자를 붙일 때 업체명 하나를 `sourcing_sources`에 넣고 바로 발주하지 않는다. 다음 경계를 순서대로 검증한다.

`Supplier Partner → Due Diligence/Contract → Seller Source → Supplier SKU → EKODI Product → Pilot Fulfillment`

## 운영 화면

- `/supplier-ops`
- Google/Supabase 로그인 후 `MALL_OPERATIONS_EMAILS` allowlist 계정만 접근한다.
- 브라우저에 `MALL_OPERATIONS_TOKEN`을 입력하거나 저장하지 않는다.
- 서비스간 자동화가 필요할 때만 서버 전용 `MALL_OPERATIONS_TOKEN`을 별도로 사용할 수 있다.

## Partner 상태

1. `candidate`
2. `due_diligence`
3. `contracted`
4. `pilot_ready`
5. `pilot_active`
6. `active`

`suspended`와 `rejected`는 별도 운영상태다. 상태를 임의로 건너뛸 수 없다.

`contracted` 이상으로 가려면 다음 참조가 모두 필요하다.

- 사업자/법인 검증 참조
- 기본 공급계약 참조
- 개인정보 처리위탁 참조
- 반품정책 참조
- CS 책임정책 참조

`pilot_active`는 추가로 계약 검증된 seller source 1개 이상과 SKU→상품 매핑 1개 이상이 있어야 한다. `active`는 파일럿 완료 근거 참조가 필요하다.

## Seller Source와 계약 스냅샷

Partner 검증은 업체 단위다. 실제 주문에 사용되는 계약은 `supplier_contracts`에 seller/source 단위 스냅샷으로 별도 보관한다.

Partner가 계약완료 상태여도 source 계약 검증을 하지 않으면 해당 source는 Fulfillment에 진입할 수 없다.

Source 계약 스냅샷을 검증할 때 Partner의 계약·PII·반품 참조를 복사하고 `sourcing_sources`를 `contract_verified`로 전환한다. 이것은 고객 개인정보를 실제로 release하는 행위가 아니다.

## SKU와 상품 매핑

`Supplier SKU`는 하나의 seller source에 연결한다. SKU 등록 시 확정 공급가·배송비·재고상태를 source에도 동기화해 Fulfillment의 실제 주문 마진 재검증이 같은 원가를 사용하게 한다.

SKU→EKODI 상품 매핑 시:

- SKU source와 상품의 seller가 같아야 한다.
- 직접판매 상품만 허용한다.
- `supplier_sku_product_links`에 운영상 매핑을 기록한다.
- 기존 `product_source_links`에도 동일한 source와 최소 마진 규칙을 원자적으로 upsert한다.

## 계속 잠가두는 것

Partner가 `active`여도 아래는 자동 활성화하지 않는다.

- `PAYMENTS_ENABLED=false`
- `BUYER_PII_RELEASE_ENABLED=false`
- `SUPPLIER_FORWARD_ENABLED=false`
- `SOURCING_AUTO_ORDER_ENABLED=false`
- Supplier payout execution=false
- refund execution=false
- `supplier_partners.auto_order_allowed=0`

첫 파일럿은 `contract_supplier + manual_forward` 방식으로 검증한다. Supplier API Auto Order 승격은 공식 주문 API 권한, idempotency, 주문취소, 오류복구, 가격·재고 재검증, PII 전달범위, 반품/환불 동기화 테스트가 별도로 통과한 공급자만 대상으로 한다.
