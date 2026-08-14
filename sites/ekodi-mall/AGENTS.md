# EKODI Mall Agent Editing Rules

이 디렉터리는 Cloudflare Pages용 에코디몰과 **Mall 전용 API/D1** 소스이며 EKODI Commerce Platform의 독립 배포 단위입니다.

## 기본 원칙

1. 정적 큐레이션 상품은 `content/products.json`, 브랜드·커머스 정책은 `content/site.json`에서 관리한다.
2. Google 회원 개인상품은 Mall API + 전용 D1이 서버 원본이며 Store는 선택사항이다.
3. `api/worker.js`는 주문·Toss·정산 core, `api/entry.js`는 first-touch·공개상품 피드·소싱 라우팅·강화 health를 담당하고 나머지는 core에 위임한다.
4. 브라우저 `localStorage`는 편집/anonymous visitor 안전망일 뿐 회원권한·수수료·정산 근거가 아니다. attribution token 자체는 서버 DB가 발급·검증한다.
5. 공개 개인상품은 서버 `published` 상태인 경우에만 `/p/{shareCode}` 고유링크에서 노출한다.
6. 가격, 구매 URL, 사업자등록번호, 통신판매업 신고번호를 확인 없이 추정하거나 만들어 넣지 않는다.
7. 제휴판매 URL은 HTTPS만 허용하고 에코디 결제로 위장하지 않는다.
8. `dist/`는 빌드 산출물이므로 직접 편집하거나 커밋하지 않는다.

## 플랫폼 격리 규칙

1. Mall 기능 작업은 원칙적으로 `sites/ekodi-mall/**` 안에서 완결한다.
2. `api.ekodi.kr`, `auth.ekodi.kr`, `pay.ekodi.kr`, `finance-api.ekodi.kr` 내부 DB를 Mall 편의를 위해 직접 수정하지 않는다.
3. production은 Worker `ekodi-mall-api` + D1 `ekodi-mall`, staging은 Worker `ekodi-mall-api-staging` + D1 `ekodi-mall-staging`을 사용한다. 두 DB를 섞지 않는다.
4. 루트에 별도 `mall-api-worker.js`/`wrangler.mall-api.toml` 같은 두 번째 Mall API를 만들지 않는다. `mall-api.ekodi.kr`는 `sites/ekodi-mall/api/entry.js` 단일 진입점만 사용한다.
5. Google/Supabase 사용자 토큰은 Mall API가 Auth 서버에서 재검증한다. 브라우저가 보낸 이메일·회원등급을 신뢰하지 않는다.
6. 수수료·attribution·membership·주문금액·정산원장·소싱 권한은 서버가 최종 결정한다.

## 판매경로와 수수료

1. 개인상품 요율은 PG 및 플랫폼 수수료 VAT 포함 정책으로 direct 7%, marketplace 8%, AI 9%다. PRO AI 구독은 별도다.
2. `/p/{shareCode}` canonical 상품 URL 자체는 **marketplace 8% 기본경로**다.
3. 판매자 직접공유 7%는 로그인한 판매자가 `/api/products/{id}/share-links`에서 발급한 opaque `ref` 링크를 통해서만 시작한다.
4. AI 9% 링크는 공개 브라우저가 임의로 만들 수 없고 내부 권한이 있는 서버 경로에서만 발급한다.
5. 상품별 anonymous visitor의 **최초 유입을 7일** 서버 `attribution_visits`에 보존한다. 유효기간 안에서는 뒤에 방문한 일반 Mall/다른 ref가 최초 경로를 덮지 않는다.
6. first-touch가 발급한 attribution token을 주문 quote가 서버에서 다시 검증한다. 없거나 유효하지 않으면 marketplace 8%로 처리한다.
7. 사업자 인증 Store 직접판매 기본요율은 10%이며 Store 검증 완료 전 checkout을 활성화하지 않는다.
8. 정산금은 `gross - platform fee - refund/adjustment` 원칙으로 서버 원장에 기록하고 브라우저 계산값을 신뢰하지 않는다.

## 소싱·무재고 판매 원칙

1. 일반 리테일 쇼핑몰(Auction 등)은 `retail_reference`로 분류하며 **참고 URL 또는 외부 이동** 용도로만 사용한다. 해당 쇼핑몰 API에서 얻은 상품 이미지·상세설명·카탈로그 정보를 EKODI DB에 복제 저장하지 않는다.
2. 외부 제휴상품은 `external_affiliate`로 분류하고 고객 결제·배송·반품은 원 판매처에서 진행한다.
3. EKODI에서 주문을 받고 공급자가 고객에게 직배송하는 `supplier_dropship`은 공급계약과 개인정보 처리조건이 검증된 공급자만 허용한다.
4. 새로 등록된 계약 공급자는 항상 `contract_pending`/`order_permission=none`/`pii_permission=none`으로 시작한다. 판매자 브라우저에서 스스로 승인 상태로 바꿀 수 없다.
5. Auto Source는 판매가에서 EKODI 거래수수료, 공급가, 배송비를 차감해 마진과 권한 상태를 함께 비교한다. 초기에는 **Dry-run만** 수행한다.
6. Auto Order는 공급자의 공식 주문 API 권한, 계약, 개인정보 처리권한, provider gate, 환경 전역 gate가 모두 있어야 한다. 기본값은 OFF다.
7. 일반몰의 고객계정/비밀번호를 저장하거나 비공식 크롤링·브라우저 자동구매로 발주하지 않는다.
8. 공급처 가격·재고는 출처와 시점을 기록하고, 주문 직전 재검증 가능한 공식 계약/API가 없는 경우 자동발주 후보로 승격하지 않는다.

## 현재 가능한 것

- Google 회원 Seller Studio 로그인
- 개인상품/선택 Store 브라우저 초안
- Mall D1 서버 저장 및 수정
- 상품 게시/비게시 상태
- 상품별 opaque share code와 `/p/{shareCode}` 공개링크
- 판매자 직접공유 7% 추적링크 서버발급
- 에코디몰 메인에 서버 게시 개인상품 노출 + marketplace 8% canonical 유입
- 내부 AI 9% attribution link
- anonymous 7일 first-touch 서버 보존
- 서버 주문 quote와 7/8/9·사업자 10% 수수료 계산
- 주문·결제·정산원장 스키마와 판매자 조회 API
- Toss 결제 승인 서버검증 코드와 금액 일치 검증
- 외부 제휴상품 공개링크 라우팅
- Sourcing Lab에서 외부 참고/제휴/계약 공급자 후보 등록
- 상품과 공급처 연결 및 Auto Source Dry-run

## 아직 켜지 않는 것

- 실제 직접판매 온라인 결제 (`PAYMENTS_ENABLED=false` 유지)
- 미검증 판매자의 주문 생성
- 실제 Toss Client 결제창
- 토스 지급대행 판매자 KYC와 지급 실행
- 취소·부분취소·환불 원장 자동화
- 구매자 배송정보/개인정보 수집 checkout
- PRO AI 실제 결제 및 entitlement unlock
- 일반 리테일몰 자동구매
- 미계약 공급자에게 고객 개인정보 전달
- 공급자 API 자동발주 (`SOURCING_AUTO_ORDER_ENABLED` 기본 OFF)

## 변경 후 필수 확인

```bash
cd sites/ekodi-mall
npm run doctor
```

검증 또는 빌드가 실패하면 병합하지 않는다.

## 배포

Mall 변경은 `.github/workflows/deploy-ekodi-mall.yml`에서 다음 순서로만 승격한다.

1. JS/API 계약·정적 빌드·모든 D1 migration을 로컬 검증한다.
2. `ekodi-mall-staging` D1에 migration을 적용한다.
3. `mall-api-staging.ekodi.kr` staging Worker를 배포한다.
4. staging `/health`에서 base/order/first-touch/sourcing schema, 7·8·9, 공개상품 feed, `paymentsEnabled=false`, `payoutExecutionEnabled=false`를 확인한다.
5. staging 성공 후에만 production D1 `ekodi-mall`과 `mall-api.ekodi.kr`로 승격한다.
6. production API 검증 성공 후에만 Cloudflare Pages 운영본을 배포하고 UI smoke test를 수행한다.

## 결제·자동발주 기능을 켜기 전

`content/site.json`의 결제표시와 `api/wrangler.toml`의 `PAYMENTS_ENABLED`, 소싱 자동발주 gate를 활성화하기 전에 다음을 모두 만족해야 한다.

- 실제 사업자·고객센터 정보가 등록되어 있다.
- 판매자 신원/사업자 검증과 직접판매 활성화 절차가 운영 가능하다.
- 상품별 checkout gate가 서버 검증을 통과한다.
- Mall 주문금액·수수료·attribution 검증을 서버가 수행한다.
- Toss 서버키 및 실제 클라이언트 결제창 계약이 준비되어 있다.
- 구매자 배송·연락정보 수집 시 개인정보 처리와 보관정책이 반영되어 있다.
- 결제 성공을 브라우저 반환값만으로 확정하지 않는다.
- 취소·환불·부분취소 원장 처리와 판매자별 지급대행/KYC·정산 책임이 정의되어 있다.
- 직배송 공급자는 공급계약·반품/CS 책임·개인정보 처리위탁/제공 구조가 검증되어 있다.
- 자동발주 API는 공급자별 공식 권한과 주문취소/실패/중복방지 계약 테스트를 통과한다.
- 실제 지급·자동발주 실행은 별도 검수 없이 자동 활성화하지 않는다.
