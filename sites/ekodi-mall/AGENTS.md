# EKODI Mall Agent Editing Rules

이 디렉터리는 Cloudflare Pages용 에코디몰 소스이며 **EKODI Commerce Platform의 독립 배포 단위**입니다.

## 기본 원칙

1. 일반 상품 수정은 `content/products.json`만 편집한다.
2. 브랜드·메인 문구·사업자 정보·커머스 모드는 `content/site.json`만 편집한다.
3. 스토어 운영 주체는 `content/stores.json`에서 관리하고 모든 공개 상품은 유효한 `storeId`를 가져야 한다.
4. 배송·교환·개인정보·이용안내 문구는 `content/pages.json`만 편집한다.
5. 디자인은 `assets/*.css`, 동작은 `assets/*.js`, HTML 구조는 `src/*.template.html`에서 수정한다.
6. `dist/`는 빌드 산출물이므로 직접 편집하거나 커밋하지 않는다.
7. 가격, 구매 URL, 사업자등록번호, 통신판매업 신고번호를 확인 없이 추정하거나 만들어 넣지 않는다.
8. 판매가 확정되지 않은 상품은 `price: null`과 준비 상태 문구를 유지한다.
9. 상품을 일시적으로 숨길 때 삭제하지 말고 `published: false`를 사용한다.

## 플랫폼 격리 규칙

1. Mall 기능 작업은 원칙적으로 `sites/ekodi-mall/**` 안에서 완결한다.
2. `api.ekodi.kr`, `auth.ekodi.kr`, `pay.ekodi.kr`, `finance-api.ekodi.kr` 소스를 Mall 기능 구현 편의를 위해 직접 수정하지 않는다.
3. 다른 EKODI 플랫폼과 연결할 때는 URL 또는 명시적 API 계약을 사용하고 상대 플랫폼 내부 데이터 구조를 가정하지 않는다.
4. Seller Studio의 현재 초안 저장은 브라우저 `localStorage` 기반이다. 서버 저장, 사용자 계정 동기화, 실제 AI 호출이 된 것처럼 표시하지 않는다.
5. Inquiry Basket은 상담 준비 도구다. `paymentsEnabled=false`인 동안 주문 확정, 재고 예약, 결제 완료로 표현하지 않는다.
6. 향후 Mall 전용 백엔드를 추가할 때도 별도 Worker/DB를 우선하며, 공유 D1을 사용할 경우 명시적 승인과 영향 범위 검증을 추가한다.

## 변경 후 필수 확인

```bash
cd sites/ekodi-mall
npm run doctor
```

검증 또는 빌드가 실패하면 커밋하지 않는다.

## 배포

`main`에 에코디몰 관련 변경이 들어오면 `.github/workflows/deploy-ekodi-mall.yml`이 자동 실행된다.

- Cloudflare Secrets가 있으면 `dist/`를 `ekodi-mall` Pages 프로젝트로 자동 배포한다.
- Secrets가 없으면 콘텐츠 검증과 빌드는 성공시키되 배포는 건너뛴다.
- 배포 산출물은 항상 빌드 스크립트가 새로 만든 `dist/`만 사용한다.
- 다른 EKODI 플랫폼의 자동 배포를 Mall 변경의 전제조건으로 삼지 않는다.

## 결제 기능을 켜기 전

`content/site.json`의 `commerce.paymentsEnabled`를 `true`로 변경하기 전에 실제 사업자 정보와 고객센터 정보를 모두 채운다. 검증 스크립트가 누락된 필드를 차단한다.

또한 다음 조건을 모두 만족해야 한다.

- Mall 주문 데이터의 서버 저장소와 주문번호 발급 규칙이 존재한다.
- 금액 검증은 서버에서 수행한다.
- `pay.ekodi.kr` 또는 결제 서비스와의 API 계약이 문서화되어 있다.
- 결제 성공을 브라우저 반환값만으로 확정하지 않는다.
- 취소·환불·정산 책임 주체가 스토어별로 정의되어 있다.
