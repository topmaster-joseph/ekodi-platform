# EKODI Mall Agent Editing Rules

이 디렉터리는 Cloudflare Pages용 에코디몰과 **Mall 전용 API/D1** 소스이며 EKODI Commerce Platform의 독립 배포 단위입니다.

## 기본 원칙

1. 정적 큐레이션 상품은 `content/products.json`, 브랜드·커머스 정책은 `content/site.json`에서 관리한다.
2. Google 회원 개인상품은 `api/worker.js` + Mall 전용 D1이 서버 원본이며 Store는 선택사항이다.
3. 브라우저 `localStorage`는 편집 중 임시저장 안전망일 뿐 서버 원본·회원권한·정산 근거로 사용하지 않는다.
4. 공개 개인상품은 서버 `published` 상태인 경우에만 `/p/{shareCode}` canonical 주소에서 노출한다.
5. 가격, 구매 URL, 사업자등록번호, 통신판매업 신고번호를 확인 없이 추정하거나 만들어 넣지 않는다.
6. 제휴판매 URL은 HTTPS만 허용하고 에코디 결제로 위장하지 않는다.
7. `dist/`는 빌드 산출물이므로 직접 편집하거나 커밋하지 않는다.

## 플랫폼 격리 규칙

1. Mall 기능 작업은 원칙적으로 `sites/ekodi-mall/**` 안에서 완결한다.
2. `api.ekodi.kr`, `auth.ekodi.kr`, `pay.ekodi.kr`, `finance-api.ekodi.kr` 내부 DB를 Mall 편의를 위해 직접 수정하지 않는다.
3. Mall 데이터는 별도 Worker `ekodi-mall-api`와 전용 D1을 사용한다. production은 `ekodi-mall`, staging은 `ekodi-mall-staging`으로 분리한다.
4. Google/Supabase 사용자 토큰은 Mall API가 Auth 서버에서 재검증한다. 브라우저가 보낸 이메일·회원등급을 신뢰하지 않는다.
5. 다른 EKODI 서비스와 연결할 때는 명시적 API 계약만 사용한다.

## 개인상품·Store 원칙

1. Google 회원은 Store 없이 자기 이름으로 상품을 서버에 저장·게시할 수 있다.
2. Store는 선택사항이다. 나중에 Store를 만들어도 기존 개인상품을 재등록하지 않고 연결할 수 있어야 한다.
3. `/p/{shareCode}`는 상품의 canonical 공개주소이며 Mall 검색·카테고리에서 사용할 수 있다.
4. 판매자가 직접 공유할 때는 canonical 주소 자체를 7% 링크로 간주하지 않는다. 인증된 판매자가 Mall API에 요청해 별도 `ref` token이 포함된 직접공유 링크를 발급받는다.
5. 공개 상품 API에는 Supabase 사용자 UUID나 내부 seller/product DB 식별자를 불필요하게 노출하지 않는다.

## 판매수수료·Attribution 원칙

1. 개인상품 판매경로 요율은 PG·VAT 포함 기준 direct 7%, marketplace 8%, AI 9%다. PRO AI 구독은 별도다.
2. 사업자 인증 Store의 기본 판매수수료는 10%다. Store 검증 완료 전에는 10% 거래/checkout을 활성화하지 않는다.
3. URL의 `source=direct`, `direct=1` 같은 임의 query string을 수수료 근거로 절대 신뢰하지 않는다.
4. 7% direct는 Mall API가 인증된 판매자에게 발급한 활성 `share_links` token이 실제 상품과 일치할 때만 인정한다.
5. 9% AI는 향후 신뢰된 Marketing AI 서버 계약이 발급한 AI token에서만 인정한다. 공개 브라우저가 스스로 AI/direct token을 만들 수 없어야 한다.
6. token 없는 Mall canonical 방문은 marketplace 8%다.
7. attribution은 상품별 anonymous visitor first-touch를 기본 7일 보존한다. 유효기간 안에서는 뒤의 임의 링크가 최초 경로를 덮지 않는다.
8. 수수료·attribution·membership·정산은 서버 권한이 최종 결정한다.
9. 방문 추적을 위해 이메일·전화번호·원문 IP 등 불필요한 개인정보를 attribution 테이블에 저장하지 않는다.

## 현재 가능한 것

- Google 회원 Seller Studio 로그인
- 개인상품/선택 Store 브라우저 초안 + Mall D1 서버 저장/수정
- 상품 게시/비게시 상태
- 상품별 opaque share code와 `/p/{shareCode}` canonical 공개주소
- 인증 판매자용 7% 직접공유 링크 발급
- Mall 메인에 서버 게시 개인상품 노출 및 8% marketplace 유입
- anonymous 7일 first-touch attribution 기록
- 외부 제휴상품 공개링크 라우팅

## 아직 켜지 않는 것

- 직접판매 온라인 결제
- 주문 확정/재고 예약
- 토스 지급대행 판매자 KYC
- 환불/취소/정산 실행
- PRO AI 실제 결제 및 entitlement unlock
- 공개 클라이언트에서 AI attribution token 발급

## 변경 후 필수 확인

```bash
cd sites/ekodi-mall
npm run doctor
```

검증 또는 빌드가 실패하면 병합하지 않는다.

## 배포

Mall 변경은 `.github/workflows/deploy-ekodi-mall.yml`에서 다음 순서를 강제한다.

1. 소스·API 계약·정적 빌드·모든 D1 migration을 로컬 검증한다.
2. `ekodi-mall-staging` D1에 migration을 적용한다.
3. `mall-api-staging.ekodi.kr` staging Worker를 배포하고 health, 7·8·9 정책, 구형 public-direct 발급 차단을 smoke test한다.
4. staging 검증이 성공한 경우에만 `ekodi-mall` production D1 migration과 `mall-api.ekodi.kr` Worker로 승격한다.
5. production API 검증이 성공한 경우에만 Cloudflare Pages 운영본을 배포한다.
6. 마지막으로 운영 Mall UI를 smoke test한다.

staging과 production D1은 물리적으로 분리하고 production 데이터를 staging 검증에 사용하지 않는다.

## 결제 기능을 켜기 전

`content/site.json`의 `commerce.paymentsEnabled`를 `true`로 바꾸기 전에 다음을 모두 만족해야 한다.

- 실제 사업자·고객센터 정보가 등록되어 있다.
- Mall 주문 데이터와 주문번호 규칙이 서버에 존재한다.
- 금액·수수료·attribution 검증을 서버가 수행한다.
- `pay.ekodi.kr` 또는 Toss와의 API 계약이 문서화되어 있다.
- 결제 성공을 브라우저 반환값만으로 확정하지 않는다.
- 판매자 KYC, 취소·환불·지급대행·정산·지급 실패 책임이 정의되어 있다.
