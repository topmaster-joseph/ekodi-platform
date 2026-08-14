# EKODI Preview-Gated Release Policy

EKODI 웹 서비스 변경은 운영 사이트에 직접 배포하지 않는다.

기본 흐름은 다음과 같다.

1. 소스 빌드와 정적 검증을 수행한다.
2. 동일한 빌드 산출물을 Cloudflare Pages의 격리된 preview branch에 배포한다.
3. preview URL에서 HTTP 상태와 서비스별 필수/금지 마커를 자동 검증한다.
4. 모든 preview가 통과한 경우에만 같은 산출물을 production branch로 승격한다.
5. 운영 도메인에서 다시 smoke test와 서비스별 심층 검증을 수행한다.
6. 어느 단계든 실패하면 즉시 실패 처리하고 다음 단계로 진행하지 않는다.

## 공통 릴리스 컨트롤러

`scripts/guarded-pages-release.mjs`

배포 대상은 `deploy/manifests/*.pages.json` 파일로 선언한다. 각 대상은 다음 정보를 가진다.

- `project`: Cloudflare Pages 프로젝트명
- `directory`: 빌드 산출물 디렉터리
- `productionUrl`: 운영 검증 URL
- `expect`: preview와 production에서 반드시 존재해야 하는 문자열
- `forbid`: 존재하면 배포 실패로 처리할 문자열

## 현재 적용

Marketing AI가 첫 적용 서비스다.

`deploy/manifests/marketing-ai.pages.json`은 다음 네 프로젝트를 하나의 release unit으로 묶는다.

- marketing.ekodi.kr
- jadam.ekodi.kr
- pizzamaru.ekodi.kr
- yogurt.ekodi.kr

네 preview가 모두 통과하기 전에는 어느 production 프로젝트도 변경하지 않는다.

## 블루-그린에 대한 원칙

현재 Cloudflare Pages에서는 production 승격 전에 branch preview를 green 후보로 사용한다. 이것은 운영 트래픽을 두 개의 고정 production stack 사이에서 전환하는 완전한 blue-green 라우팅은 아니다. 향후 무중단 즉시 롤백이 필요한 서비스는 별도의 blue/green Pages 프로젝트 또는 Worker 라우팅 계층을 두고 전환한다.
