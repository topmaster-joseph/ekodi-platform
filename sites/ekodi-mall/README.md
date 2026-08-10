# EKODI Mall

Cloudflare Pages 자동 배포 소스입니다.

## 운영 경로
- Production branch: `main`
- Site source: `sites/ekodi-mall/`
- Cloudflare Pages project: `ekodi-mall`
- Public URL: `https://ekodi-mall.pages.dev/`

## 자동 배포
`.github/workflows/deploy-ekodi-mall.yml`이 `sites/ekodi-mall/**` 변경을 감지해 Wrangler로 Cloudflare Pages에 배포합니다.

GitHub Actions repository secrets에 다음 2개가 필요합니다.
- `CLOUDFLARE_API_TOKEN`: Cloudflare Pages Edit 권한 토큰
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID

정적 사이트 검증을 먼저 통과한 뒤 배포하며, 같은 배포가 겹치면 이전 실행을 취소합니다.

## Cloudflare Git Integration 선택지
기존 Pages 프로젝트가 Git-integrated 프로젝트인 경우에는 Cloudflare가 `main`을 직접 감시하도록 전환할 수도 있습니다. 현재 GitHub 계정에는 Cloudflare Workers & Pages GitHub App 설치가 확인되지 않아, 기본 자동 배포는 Wrangler 방식으로 구성했습니다.
