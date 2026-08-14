# EKODI Mall Agent Editing Rules

이 디렉터리는 Cloudflare Pages용 에코디몰 소스이며 **EKODI Commerce Platform의 독립 배포 단위**입니다.

## 기본 원칙

1. 일반 공개 정적 상품 수정은 `content/products.json`만 편집한다.
2. 브랜드·메인 문구·사업자 정보·커머스 모드·판매수수료 정책은 `content/site.json`만 편집한다.
3. 기존 정적 상품은 콘텐츠 모델의 `storeId`를 유지한다. Seller Studio의 사용자 생성 상품은 `Seller -> Product`가 기본이고 Store는 선택사항이다.
4. 사용자 생성 상품의 서버 모델은 `sellerId` 필수, `storeId` nullable로 유지한다. 이후 Store를 만들면 기존 상품을 재등록하지 않고 연결한다.
5. 배송·교환·개인정보·이용안내 문구는 `content/pages.json`만 편집한다.
6. 디자인은 `assets/*.css`, 동작은 `assets/*.js`, HTML 구조는 `src/*.template.html`에서 수정한다.
7. `dist/`는 빌드 산출물이므로 직접 편집하거나 커밋하지 않는다.
8. 가격, 구매 URL, 사업자등록번호, 통신판매업 신고번호를 확인 없이 추정하거나 만들어 넣지 않는다.
9. 결제가 활성화되지 않은 상품을 주문·결제 가능한 상품처럼 표시하지 않는다.

## 개인상품·스토어·고유링크 원칙

1. Google 회원은 Store 없이 자기 판매자 프로필에 귀속된 상품을 저장할 수 있다.
2. Store 개설은 선택사항이며 개인상품 등록의 선행조건으로 사용하지 않는다.
3. 상품별 고유주소는 `https://mall.ekodi.kr/p/{publicId}` 계약을 사용한다.
4. 브라우저에서 만든 임시 ID는 서버 권위 ID가 아니다. Mall API 저장 후 서버가 `publicId`를 발급한다.
5. `published` 상품만 공개 고유주소에서 조회한다.
6. `localStorage`는 네트워크 장애 시 편집 내용을 잃지 않기 위한 임시 백업이다. 서버 저장 성공 후에는 Mall API 데이터를 권위 데이터로 본다.
7. 공개 상품 API는 내부 Supabase 사용자 UUID, 내부 상품 레코드 ID 등 불필요한 내부 식별자를 노출하지 않는다.

## 판매수수료·Attribution 정책

1. 개인상품 거래수수료는 PG 및 플랫폼 수수료 VAT를 포함한 최종 판매수수료 기준으로 다음 3단계를 사용한다.
   - Mall API가 발급한 판매자 직접공유 토큰 유입: 7%
   - EKODI Mall 일반 검색·카테고리·추천 유입: 8%
   - 신뢰된 AI 캠페인 토큰 유입: 9%
2. 브라우저의 query string이나 `source=direct` 같은 임의 값을 수수료 판정에 사용하지 않는다.
3. first-touch attribution 기본 유효기간은 7일이며 서버가 원본 유입경로를 보존한다.
4. PRO AI도 개인상품 거래수수료는 동일한 7%·8%·9%를 사용한다. PRO AI 월 구독료는 별도 AI 이용료다.
5. 사업자 인증 Store의 직접판매 기본 판매수수료는 10% 정책을 유지한다. `verified` 상태는 판매자가 브라우저에서 스스로 설정할 수 없다.
6. 최소수수료, 지급대행 수수료, 추가 결제원가는 실제 PG/지급대행 계약조건을 확인하기 전 임의로 만들거나 활성화하지 않는다.
7. 실제 적용 요율, 환불·취소·조정액, 정산금은 반드시 서버에서 다시 계산한다.

## 플랫폼 격리 규칙

1. Mall UI는 `sites/ekodi-mall/**`, Mall 서버는 `sites/ekodi-mall-api/**`에서 관리한다.
2. Mall API는 staging `ekodi-mall-staging`, production `ekodi-mall` 전용 Cloudflare D1을 사용한다. 공유 D1을 사용하지 않는다.
3. `api.ekodi.kr`, `auth.ekodi.kr`, `pay.ekodi.kr`, `finance-api.ekodi.kr` 소스를 Mall 기능 구현 편의를 위해 직접 수정하지 않는다.
4. Supabase는 현재 Seller 신원 세션 검증에만 사용하고 Mall 상품 데이터를 공유 Supabase 테이블에 넣지 않는다.
5. 다른 EKODI 플랫폼과 연결할 때는 URL 또는 명시적 API 계약을 사용하고 상대 플랫폼 내부 데이터 구조를 가정하지 않는다.
6. Inquiry Basket은 상담 준비 도구다. `paymentsEnabled=false`인 동안 주문 확정, 재고 예약, 결제 완료로 표현하지 않는다.

## 변경 후 필수 확인

```bash
cd sites/ekodi-mall
npm run doctor
node --check ../ekodi-mall-api/worker.js
node --test ../../test/mall-api-contract.test.mjs
```

검증 또는 빌드가 실패하면 운영으로 승격하지 않는다.

## 배포

- Mall UI: `.github/workflows/deploy-ekodi-mall.yml`
- Mall API: `.github/workflows/deploy-ekodi-mall-api.yml`
- API는 `api-staging.mall.ekodi.kr` + `ekodi-mall-staging` D1에서 먼저 migration·deploy·smoke test를 통과한 뒤 production으로 승격한다.
- production은 `api.mall.ekodi.kr` + `ekodi-mall` D1을 사용한다.
- 다른 EKODI 플랫폼의 내부 배포를 Mall 배포의 전제조건으로 삼지 않는다.

## 결제 기능을 켜기 전

`content/site.json`의 `commerce.paymentsEnabled`를 `true`로 변경하기 전에 실제 사업자 정보와 고객센터 정보를 모두 채운다.

또한 다음 조건을 모두 만족해야 한다.

- 주문 데이터의 서버 저장소와 주문번호 발급 규칙이 존재한다.
- 판매자 KYC 및 개인/사업자 구분이 검증된다.
- 금액과 7%·8%·9%·10% 수수료를 서버가 신뢰 가능한 attribution으로 재검증한다.
- `pay.ekodi.kr` 또는 결제 서비스와의 API 계약이 문서화되어 있다.
- Toss 지급대행 등 판매자별 지급 구조와 비용이 실제 계약조건으로 확인된다.
- 결제 성공을 브라우저 반환값만으로 확정하지 않는다.
- 취소·환불·분쟁·정산·지급 실패의 책임과 처리 규칙이 정의되어 있다.
