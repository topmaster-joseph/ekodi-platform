# EKODI Mall Agent Editing Rules

이 디렉터리는 Cloudflare Pages용 에코디몰과 **Mall 전용 API/D1** 소스이며 EKODI Commerce Platform의 독립 배포 단위입니다.

## 기본 원칙

1. 정적 큐레이션 상품은 `content/products.json`, 브랜드·커머스 정책은 `content/site.json`에서 관리한다.
2. Google 회원 개인상품은 `api/worker.js` + Mall 전용 D1이 서버 원본이며 Store는 선택사항이다.
3. 브라우저 `localStorage`는 편집 중 임시저장 안전망일 뿐 서버 원본·회원권한·정산 근거로 사용하지 않는다.
4. 공개 개인상품은 서버 `published` 상태인 경우에만 `/p/{shareCode}` 고유링크에서 노출한다.
5. 가격, 구매 URL, 사업자등록번호, 통신판매업 신고번호를 확인 없이 추정하거나 만들어 넣지 않는다.
6. 제휴판매 URL은 HTTPS만 허용하고 에코디 결제로 위장하지 않는다.
7. `dist/`는 빌드 산출물이므로 직접 편집하거나 커밋하지 않는다.

## 플랫폼 격리 규칙

1. Mall 기능 작업은 원칙적으로 `sites/ekodi-mall/**` 안에서 완결한다.
2. `api.ekodi.kr`, `auth.ekodi.kr`, `pay.ekodi.kr`, `finance-api.ekodi.kr` 내부 DB를 Mall 편의를 위해 직접 수정하지 않는다.
3. Mall 데이터는 별도 Worker `ekodi-mall-api`와 별도 D1 `ekodi-mall`을 우선 사용한다.
4. Google/Supabase 사용자 토큰은 Mall API가 Auth 서버에서 재검증한다. 브라우저가 보낸 이메일·회원등급을 신뢰하지 않는다.
5. 개인상품 판매경로 요율은 direct 7%, marketplace 8%, AI 9%이며 PG·VAT 포함 정책이다. PRO AI 구독은 별도다.
6. 사업자 인증 Store 직접판매 기본요율은 10%이나 실제 사업자 검증 완료 전 checkout을 활성화하지 않는다.
7. 수수료·attribution·membership·정산은 서버 권한이 최종 결정한다.

## 현재 가능한 것

- Google 회원 Seller Studio 로그인
- 개인상품/선택 Store 브라우저 초안
- Mall D1 서버 저장 및 수정
- 상품 게시/비게시 상태
- 상품별 opaque share code와 `/p/{shareCode}` 공개링크
- 직접 공유 진입용 7일 attribution token 발급
- 외부 제휴상품 공개링크 라우팅

## 아직 켜지 않는 것

- 직접판매 온라인 결제
- 주문 확정/재고 예약
- 토스 지급대행 판매자 KYC
- 환불/취소/정산 실행
- PRO AI 실제 결제 및 entitlement unlock

## 변경 후 필수 확인

```bash
cd sites/ekodi-mall
npm run doctor
```

검증 또는 빌드가 실패하면 병합하지 않는다.

## 배포

`main`의 Mall 변경은 `.github/workflows/deploy-ekodi-mall.yml`에서 검증한다. Cloudflare 자격증명이 있으면 `ekodi-mall` D1을 존재 여부에 따라 생성/재사용하고 migration을 적용한 뒤 `ekodi-mall-api` Worker를 배포한다. API health/schema 검증이 성공한 경우에만 Pages 운영배포와 smoke test를 진행한다.

## 결제 기능을 켜기 전

`content/site.json`의 `commerce.paymentsEnabled`를 `true`로 바꾸기 전에 다음을 모두 만족해야 한다.

- 실제 사업자·고객센터 정보가 등록되어 있다.
- Mall 주문 데이터와 주문번호 규칙이 서버에 존재한다.
- 금액·수수료·attribution 검증을 서버가 수행한다.
- `pay.ekodi.kr` 또는 Toss와의 API 계약이 문서화되어 있다.
- 결제 성공을 브라우저 반환값만으로 확정하지 않는다.
- 취소·환불·판매자별 지급대행·정산 책임이 정의되어 있다.
