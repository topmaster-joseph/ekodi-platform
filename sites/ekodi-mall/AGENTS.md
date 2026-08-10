# EKODI Mall Agent Editing Rules

이 디렉터리는 Cloudflare Pages용 에코디몰 소스입니다.

## 기본 원칙

1. 일반 상품 수정은 `content/products.json`만 편집한다.
2. 브랜드·메인 문구·사업자 정보는 `content/site.json`만 편집한다.
3. 배송·교환·개인정보·이용안내 문구는 `content/pages.json`만 편집한다.
4. 디자인은 `assets/styles.css`, 동작은 `assets/app.js`, HTML 구조는 `src/*.template.html`에서 수정한다.
5. `dist/`는 빌드 산출물이므로 직접 편집하거나 커밋하지 않는다.
6. 가격, 구매 URL, 사업자등록번호, 통신판매업 신고번호를 확인 없이 추정하거나 만들어 넣지 않는다.
7. 판매가 확정되지 않은 상품은 `price: null`과 준비 상태 문구를 유지한다.
8. 상품을 일시적으로 숨길 때 삭제하지 말고 `published: false`를 사용한다.

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

## 결제 기능을 켜기 전

`content/site.json`의 `commerce.paymentsEnabled`를 `true`로 변경하기 전에 실제 사업자 정보와 고객센터 정보를 모두 채운다. 검증 스크립트가 누락된 필드를 차단한다.
