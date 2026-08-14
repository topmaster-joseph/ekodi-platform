# EKODI Guarded Release Policy

EKODI 웹 서비스 변경은 운영 사이트에 직접 배포하지 않는다.

## Cloudflare Pages

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

## Cloudflare Workers

Workers 서비스는 Cloudflare의 Version/Deployment 모델을 이용한다.

1. 현재 production이 단일 안정 버전 100%인지 확인한다.
2. `wrangler versions upload`로 새 후보 버전을 만들되 production 트래픽에는 연결하지 않는다.
3. 기존 안정 버전 100%, 후보 버전 0%로 deployment를 구성한다.
4. `Cloudflare-Workers-Version-Overrides` 헤더로 일반 사용자 트래픽을 후보에 보내지 않은 상태에서 후보 버전을 smoke test한다.
5. 모든 후보 검사가 통과한 경우에만 후보 버전을 100%로 승격한다.
6. 승격 후 운영 URL을 다시 검증한다.
7. 후보 검사 또는 승격 후 운영 검증이 실패하면 이전 안정 버전을 100%로 자동 복구하고 복구 상태를 다시 검사한다.

공통 컨트롤러는 `scripts/guarded-worker-release.mjs`이며 대상은 `deploy/manifests/*.worker.json`으로 선언한다.

현재 2차 적용 대상은 다음과 같다.

- community.ekodi.kr (`ekodi-community`)
- books.ekodi.kr (`ekodi-books`)

Admin/Auth가 함께 있는 shared site Worker는 영향 범위가 넓으므로 위 두 서비스에서 guarded Worker release를 실전 검증한 뒤 다음 단계로 적용한다.

## 안전 원칙

- 이미 gradual deployment가 진행 중인 Worker는 자동 릴리스가 개입하지 않는다. 단일 100% 안정 버전 상태가 아니면 즉시 중단한다.
- 데이터 저장소(KV, D1, R2, Durable Objects 등)의 상태 변화는 Worker 버전 롤백으로 되돌아가지 않는다. 데이터 마이그레이션은 별도 검증·백업·롤백 절차가 필요하다.
- Worker route/custom-domain 토폴로지 변경은 코드 버전 승격과 분리해 관리한다. guarded Worker release는 기존 운영 라우팅 위에서 코드·assets·bindings 후보를 검증하고 승격하는 용도다.
- 운영에 배포된 뒤 심층 검증이 실패하면 자동 롤백을 우선한다.

## 블루-그린에 대한 정의

Pages의 branch preview 승격은 완전한 dual-stack blue-green은 아니며 preview-gated promotion이다.

Workers의 100% 안정 버전 + 0% 후보 버전 구조는 production deployment 안에 blue와 green 후보를 동시에 둔 뒤 version override로 green을 점검하고 100%로 전환하는 방식이다. 이는 빠른 자동 롤백이 가능하지만, 저장소 상태 자체까지 버전화하는 것은 아니다.
