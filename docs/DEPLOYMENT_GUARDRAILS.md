# EKODI Guarded Release Policy

EKODI 서비스 변경은 운영환경에 직접 덮어쓰지 않는다. 서비스 성격에 따라 아래 세 단계의 보호 모델을 사용한다.

## 1. Cloudflare Pages: Preview-Gated Promotion

Pages는 빌드 → 격리 preview branch 배포 → preview 자동검증 → 전부 통과한 경우에만 production 승격 → 운영 smoke/deep verification 순서로 진행한다. 공통 컨트롤러는 `scripts/guarded-pages-release.mjs`, 대상은 `deploy/manifests/*.pages.json`이다.

현재 Marketing AI의 `marketing.ekodi.kr`, `jadam.ekodi.kr`, `pizzamaru.ekodi.kr`, `yogurt.ekodi.kr` 네 프로젝트는 하나의 release unit으로 보호한다.

## 2. Stateless Workers: Stable 100% + Candidate 0%

상태 저장소 마이그레이션이 없는 Worker는 현재 production 단일 안정 버전 100%를 확인한 뒤 새 candidate version을 업로드한다. stable 100% + candidate 0% 상태에서 `Cloudflare-Workers-Version-Overrides`로 후보만 검증하고, 성공하면 candidate를 100%로 승격한다. 실패하면 이전 stable version을 100%로 자동 복구한다.

공통 컨트롤러는 `scripts/guarded-worker-release.mjs`, 대상은 `deploy/manifests/*.worker.json`이다. 현재 Community, Books, Social, 그리고 ekodi.kr/Admin/Auth/공통 허브 shared Worker가 이 정책을 사용한다.

## 3. Stateful Workers + D1

Control API와 Finance API는 destructive migration 사전 차단 → production과 분리된 `ekodi-auth-staging` D1에 migration 적용 → `api-staging.ekodi.kr` 또는 `finance-api-staging.ekodi.kr` 검증 → production D1 Time Travel recovery bookmark 기록 → production migration → Worker candidate 0% 검증 → 100% 승격 → 운영 심층검증 순서로 진행한다.

Worker 코드 검증 실패는 자동 롤백한다. D1 Time Travel restore는 정상 신규 쓰기까지 지울 수 있으므로 자동 실행하지 않고 recovery bookmark를 남겨 수동 판단한다.

Finance의 Toss 비밀키는 production 배포 뒤 별도 `secret put`으로 덮어쓰지 않는다. GitHub secret이 존재하면 후보 version upload의 `--secrets-file`에 포함해 0% 후보와 함께 검증·승격한다. secret 값은 로그에 출력하지 않는다.

## Domain / Route Topology

Worker route, custom domain, Pages-domain 연결 해제, DNS 레코드 삭제는 코드 승격과 분리한다. `deploy-service-proxy.yml`, `deploy-biz-legacy.yml`, `deploy-legacy-redirects.yml`은 자동 push 실행을 금지하고 `workflow_dispatch` 전용으로 둔다. 이 workflow들은 `deployment-guardrail: topology-workflow-manual-only` 표식을 가진다.

## Release Control

`admin.ekodi.kr`의 `Release` 화면은 주요 release unit의 최근 GitHub Actions 실행, guarded release 모델, 위험등급, 운영 도메인을 한 화면에서 보여준다. 이 화면은 읽기 전용 관제면이며 배포 우회 버튼이나 DNS 직접편집 기능을 제공하지 않는다.

Release Control의 자격증명 분리 상태는 실제 전용 Cloudflare token이 발급되기 전에는 `Prepared`로 표시한다. 코드가 준비되었다는 이유만으로 `Enforced`라고 표시하지 않는다.

Cloudflare 권한 분리의 목표 구조와 전환 순서는 `docs/CLOUDFLARE_ACCESS_MODEL.md`, 기계 판독 정책은 `config/cloudflare-access-profiles.json`을 기준으로 한다.

## Repository-Wide Policy Audit

`scripts/validate-deployment-guardrails.mjs`가 CI에서 배포경로 자체와 Cloudflare 권한 역할 정의를 검사한다. 보호 대상 workflow가 다시 direct `wrangler deploy`, `npm run deploy:*`, production Pages 직행, post-deploy `secret put` 등으로 회귀하거나 runtime deploy 권한에 DNS 쓰기를 섞으면 CI를 실패시킨다.

로컬 `npm run deploy:site`, `deploy:books`, `deploy:community`도 guarded Worker controller를 사용한다. `deploy:api`, `deploy:finance`는 stateful staging 절차를 우회할 수 있어 직접 실행을 차단하고 서비스별 guarded workflow를 사용한다.

기존 Full Ecosystem Deploy는 production 쓰기 없는 `Full Ecosystem Verification`으로 축소했다. 전체 운영 상태는 확인하지만 배포, migration, DNS, secret 변경은 수행하지 않는다.

## 안전 원칙

- gradual deployment가 이미 진행 중이면 자동 릴리스가 개입하지 않는다.
- destructive D1 변경은 expand/contract 방식으로 재설계한다.
- Worker route/custom-domain 토폴로지는 코드 version 승격과 분리한다.
- 인증, 결제, 고객, 회계 데이터는 단순 HTTP 200이 아니라 권한 경계와 필수 계약을 함께 검사한다.
- Pages의 방식은 preview-gated promotion이며, Workers의 stable100/candidate0 방식은 production deployment 안에서 blue/green 후보를 동시에 두고 전환하는 구조다.
