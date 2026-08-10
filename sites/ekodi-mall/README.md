# EKODI Mall · Sustainable Cloudflare Pages

에코디몰은 **콘텐츠 → 빌드 → 배포**를 분리한 정적 사이트입니다. 일상적인 수정은 HTML을 건드리지 않습니다.

## 1. 가장 자주 편집하는 파일

- `content/products.json` : 상품명, 상태, 배지, 카테고리, 가격, 문의/구매 링크
- `content/site.json` : 브랜드, 메인 문구, 카테고리, 선정 기준, 사업자 정보
- `content/pages.json` : 저널 문구, 배송·교환·개인정보·이용안내·문의 페이지

상품을 숨기려면 `published: false`, 공개하려면 `published: true`로 변경합니다.

## 2. 자동 생성되는 것

`npm run build`가 `dist/`를 새로 만들며 다음을 자동 생성합니다.

- 메인 상품 목록
- `/products/<slug>/` 상품 상세페이지
- `/pages/<slug>/` 정책·문의 페이지
- `sitemap.xml`, `robots.txt`
- Cloudflare `_headers`, `_redirects`

`dist/`는 결과물이므로 직접 편집하거나 Git에 커밋하지 않습니다.

## 3. 배포 전 안전장치

`npm run check`가 다음을 검사합니다.

- 상품 ID/slug 중복
- 잘못된 카테고리
- URL 형식
- 가격 형식
- 필수 문구 누락
- 온라인 결제를 켰는데 사업자 필수정보가 비어 있는 경우

검증 실패 시 Cloudflare 배포가 진행되지 않습니다.

## 4. Cloudflare Pages 운영 방식

현재 `ekodi-mall.pages.dev` 프로젝트를 그대로 유지하기 위해 **Direct Upload + GitHub Actions + Wrangler**를 기본 배포 방식으로 사용합니다.

- Production branch: `main`
- Repository: `topmaster-joseph/ekodi-platform`
- Source path: `sites/ekodi-mall/`
- Build command: `npm run build`
- Build output: `sites/ekodi-mall/dist`
- Pages project: `ekodi-mall`

GitHub Actions Secrets:

- `CLOUDFLARE_API_TOKEN` : Cloudflare Pages 편집 권한 토큰
- `CLOUDFLARE_ACCOUNT_ID` : Cloudflare 계정 ID

Secrets가 없으면 CI는 빌드·검증까지만 성공시키고 배포는 건너뜁니다. Secrets가 등록되면 `main`의 에코디몰 관련 변경만 자동으로 Cloudflare Pages에 배포합니다.

## 5. 앞으로의 편집 흐름

1. `content/*.json` 수정
2. GitHub에 커밋
3. 자동 검증 및 정적 페이지 생성
4. `main`이면 Cloudflare Pages 자동 배포
5. 문제 발생 시 이전 Git 커밋으로 되돌려 재배포

디자인 변경은 `assets/styles.css`, 기능 변경은 `assets/app.js`, 화면 구조 변경은 `src/*.template.html`만 수정합니다.

## 6. 새 Cloudflare Git Integration 프로젝트를 만들 경우

기존 Direct Upload 프로젝트와 별도로 새 Pages 프로젝트를 Git Integration으로 만들 때는 다음 값을 사용합니다.

- Root directory: `sites/ekodi-mall`
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Build watch include: `sites/ekodi-mall/*`

기존 `ekodi-mall` 프로젝트와 URL을 유지하는 동안에는 GitHub Actions + Wrangler 방식을 사용합니다.
