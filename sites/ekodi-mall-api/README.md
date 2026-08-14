# EKODI Mall API

EKODI Mall의 판매자·개인상품·스토어·고유링크·유입귀속을 담당하는 독립 Worker/D1 서비스입니다.

## 경계

- Production: `https://api.mall.ekodi.kr`
- Staging: `https://api-staging.mall.ekodi.kr`
- 데이터: `ekodi-mall` / `ekodi-mall-staging` 전용 Cloudflare D1
- 로그인 신원: 기존 EKODI Seller Studio의 Supabase access token을 서버에서 재검증
- `api.ekodi.kr`, `finance-api.ekodi.kr`, `pay.ekodi.kr`의 내부 테이블을 읽거나 쓰지 않습니다.

## 현재 활성 범위

- Google/Supabase 회원의 Seller Profile 자동 생성
- 개인상품 서버 저장·수정·목록
- Store 선택 생성 및 상품 연결
- 상품 공개
- 공개 고유주소 `mall.ekodi.kr/p/{publicId}`
- 판매자 직접공유 토큰 발급
- 7일 first-touch 유입귀속
  - seller_direct: 7%
  - marketplace: 8%
  - ai_campaign: 9%
  - 인증된 사업자 Store: 10%
- PG/VAT 포함 정책과 PRO AI 구독 분리를 서버 정책으로 반환

## 의도적으로 비활성

`POST /api/orders`는 현재 `409 PAYMENTS_DISABLED`를 반환합니다. 실제 주문·결제·지급대행·환불·정산은 다음 조건을 확인하기 전에는 활성화하지 않습니다.

1. 실제 Toss/지급대행 계약 범위
2. 판매자 KYC와 개인/사업자 법적 구분
3. 서버 금액 검증 및 주문번호 계약
4. 취소·환불·분쟁 책임
5. 정산주기·보류금·지급 실패 처리

## 주요 API

Public:
- `GET /health`
- `GET /api/policy`
- `GET /api/public/products/:publicId`
- `POST /api/attribution/visit`

Authenticated Seller:
- `GET /api/me`
- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:id`
- `PATCH /api/products/:id`
- `POST /api/products/:id/publish`
- `POST /api/products/:id/share-links`

## Attribution 원칙

브라우저의 `source=direct` 같은 임의 파라미터는 신뢰하지 않습니다. 7% 직접공유는 Mall API가 발급한 활성 `seller_direct` 토큰이 있을 때만 인정합니다. AI 9%도 신뢰된 서버가 만든 `ai_campaign` 토큰만 인정하도록 스키마를 분리했습니다.
