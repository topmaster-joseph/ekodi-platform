# EKODI Guarded Release Policy

EKODI 서비스 변경은 운영환경에 직접 덮어쓰지 않는다. 서비스 성격에 따라 아래 세 단계의 보호 모델을 사용한다.

## 1. Cloudflare Pages: Preview-Gated Promotion

Pages 서비스의 기본 흐름은 다음과 같다.

1. 소스 빌드와 정적 검증을 수행한다.
2. 동일한 빌드 산출물을 Cloudflare Pages의 격리된 preview branch에 배포한다.
3. preview URL에서 HTTP 상태와 서비스별 필수/금지 마커를 자동 검증한다.
4. 모든 preview가 통과한 경우에만 같은 산출물을 production branch로 승격한다.
5. 운영 도메인에서 다시 smoke test와 서비스별 심층 검증을 수행한다.
6. 어느 단계든 실패하면 즉시 실패 처리하고 다음 단계로 진행하지 않는다.

공통 컨트롤러는 `scripts/guarded-pages-release.mjs`이며 대상은 `deploy/manifests/*.pages.json`으로 선언한다.

현재 Marketing AI의 다음 네 Pages 프로젝트가 하나의 release unit으로 보호된다.

- marketing.ekodi.kr
- jadam.ekodi.kr
- pizzamaru.ekodi.kr
- yogurt.ekodi.kr

네 preview가 모두 통과하기 전에는 어느 production 프로젝트도 변경하지 않는다.

## 2. Stateless Cloudflare Workers: 100% Stable + 0% Candidate

상태 저장소 마이그레이션이 필요하지 않은 Worker는 Cloudflare Version/Deployment 모델을 이용한다.

1. 현재 production이 단일 안정 버전 100%인지 확인한다.
2. `wrangler versions upload`로 새 후보 버전을 만든다.
3. 기존 안정 버전 100%, 후보 버전 0%로 deployment를 구성한다.
4. `Cloudflare-Workers-Version-Overrides` 헤더로 일반 사용자 트래픽을 후보에 보내지 않은 상태에서 후보 버전을 smoke test한다.
5. 모든 후보 검사가 통과한 경우에만 후보 버전을 100%로 승격한다.
6. 승격 후 운영 URL을 다시 검증한다.
7. 후보 검사 또는 승격 후 운영 검증이 실패하면 이전 안정 버전을 100%로 자동 복구하고 복구 상태를 다시 검사한다.

공통 컨트롤러는 `scripts/guarded-worker-release.mjs`이며 대상은 `deploy/manifests/*.worker.json`으로 선언한다.

현재 보호 대상에는 다음 Worker가 포함된다.

- community.ekodi.kr (`ekodi-community`)
- books.ekodi.kr (`ekodi-books`)
- social.ekodi.kr (`ekodi-social`)
- ekodi.kr / admin.ekodi.kr / auth.ekodi.kr / 공통 허브 (`shy-thunder-39a4`)

## 3. Stateful Workers + D1: Isolated Staging DB + Recovery Point + Candidate Promotion

Control API와 Finance API처럼 D1 상태와 함께 움직이는 서비스는 코드 후보만 검증해서는 충분하지 않다.

1. destructive migration 패턴을 사전 차단한다.
2. production과 분리된 `ekodi-auth-staging` D1에 모든 migration을 먼저 적용한다.
3. `api-staging.ekodi.kr` 또는 `finance-api-staging.ekodi.kr`의 격리 Worker로 실제 API 동작과 인증 경계를 검증한다.
4. staging이 성공한 경우에만 production D1 Time Travel recovery bookmark를 기록한다.
5. production migration을 적용한다.
6. Worker 코드는 stable 100% + candidate 0%로 붙이고 version override로 후보를 검증한다.
7. 성공하면 candidate를 100%로 승격하고 운영 API를 다시 심층 검증한다.
8. 코드 검증 실패 시 이전 Worker 버전은 자동 복구한다. D1 Time Travel restore는 정상 신규 쓰기 유실 위험이 있으므로 자동 실행하지 않고 recovery bookmark를 남겨 수동 판단이 가능하게 한다.

현재 stateful 보호 대상은 다음과 같다.

- api.ekodi.kr (`ekodi-auth-api`) + D1 `ekodi-auth`
- finance-api.ekodi.kr (`ekodi-finance-api`) + D1 `ekodi-auth`

Finance의 Toss 비밀키는 production 배포 후 `secret put`으로 따로 덮어쓰지 않는다. GitHub secret이 존재하면 후보 version upload 단계의 `--secrets-file`에 포함하여 0% 후보 자체와 함께 검증·승격한다. 로그에는 secret 값을 출력하지 않는다.

## Domain / Route Topology Changes

Worker route, custom domain, Pages-domain 연결 해제, DNS 레코드 삭제처럼 라우팅 토폴로지를 변경하는 작업은 코드 버전 승격과 성격이 다르다. 현재 다음 workflow는 자동 push 배포를 금지하고 `workflow_dispatch`로만 실행한다.

- `deploy-service-proxy.yml`
- `deploy-biz-legacy.yml`
- `deploy-legacy-redirects.yml`

이 workflow들은 `deployment-guardrail: topology-workflow-manual-only` 표식을 가진다. 코드·UI 수정 자동배포가 라우팅/DNS 변경까지 끌고 가지 않도록 경계를 분리한다.

## Repository-Wide Policy Audit

`scripts/validate-deployment-guardrails.mjs`가 CI에서 배포경로 자체를 검사한다. 보호 대상 workflow가 다시 `wrangler deploy`, `npm run deploy:*`, production `pages deploy --branch=main`, post-deploy `secret put` 같은 직행 경로로 회귀하면 빌드가 실패한다.

로컬 `npm run deploy:site`, `deploy:books`, `deploy:community`도 guarded Worker controller를 사용한다. `deploy:api`와 `deploy:finance`는 상태 저장 staging 절차를 우회할 수 있으므로 직접 실행을 막고 GitHub의 guarded workflow를 사용하도록 강제한다.

기존 `Full Ecosystem Deploy` workflow는 제거하고, 같은 이름의 역할을 production 쓰기 없는 `Full Ecosystem Verification`으로 축소했다. 전체 운영 상태를 한 번에 확인할 수는 있지만 배포·migration·DNS·secret 변경은 수행하지 않는다.

## 안전 원칙

- 이미 gradual deployment가 진행 중인 Worker에는 자동 릴리스가 개입하지 않는다. 단일 100% 안정 버전 상태가 아니면 즉시 중단한다.
- 데이터 저장소(KV, D1, R2, Durable Objects 등)의 상태 변화는 Worker 버전 롤백으로 되돌아가지 않는다.
- destructive D1 변경은 expand/contract 방식으로 재설계한다.
- Worker route/custom-domain 토폴로지 변경은 코드 버전 승격과 분리한다.
- 운영에 배포된 뒤 심층 검증이 실패하면 Worker 코드는 자동 롤백을 우선한다.
- 인증, 결제, 고객 데이터, 회계 데이터는 단순 HTTP 200만으로 검증하지 않고 권한 경계와 필수 계약을 함께 검사한다.

## 블루-그린에 대한 정의

Pages의 branch preview 승격은 완전한 dual-stack blue-green은 아니며 preview-gated promotion이다.

Workers의 100% 안정 버전 + 0% 후보 버전 구조는 production deployment 안에 blue와 green 후보를 동시에 둔 뒤 version override로 green을 점검하고 100%로 전환하는 방식이다. 빠른 자동 롤백이 가능하지만 저장소 상태 자체까지 버전화하는 것은 아니다.
