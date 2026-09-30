# EKODI Cloudflare Access Model

EKODI 배포 안전성은 배포 순서뿐 아니라 자격증명 권한 경계까지 포함한다. 하나의 광범위한 Cloudflare API token이 모든 배포, D1, DNS, custom-domain 작업을 수행하지 않도록 역할을 분리한다.

## 목표 구조

### Runtime Deploy

GitHub secret: `CLOUDFLARE_DEPLOY_TOKEN`

용도는 stateless Worker version upload/promotion과 Pages preview/production promotion이다. DNS 레코드 변경, zone 설정, API token 관리 권한은 포함하지 않는다.

### Stateful Release

GitHub secret: `CLOUDFLARE_STATEFUL_TOKEN`

Control API와 Finance API처럼 D1 migration이 필요한 release unit만 사용한다. D1 migration/Time Travel 조회와 Worker candidate promotion에 필요한 권한만 포함하고 DNS·route 변경 권한은 제외한다.

### Topology

GitHub secret: `CLOUDFLARE_TOPOLOGY_TOKEN`

DNS, Worker route, custom domain, Pages domain 연결 변경에만 사용한다. 이 자격증명은 자동 push workflow에서 사용하지 않고 `workflow_dispatch` 전용 topology workflow에만 연결한다.

## 현재 상태

코드 차원의 배포 우회경로는 guarded release 정책으로 차단되어 있고 topology workflow도 manual-only로 분리되어 있다. 다만 전용 Cloudflare token 자체를 아직 발급·등록하지 않은 환경에서는 기존 `CLOUDFLARE_API_TOKEN`이 사용된다.

따라서 Release Control에서는 자격증명 분리 상태를 **Prepared**로 표시하며 **Enforced**라고 표시하지 않는다.

## 전환 순서

1. Cloudflare에서 세 역할별 token을 각각 발급한다.
2. GitHub Actions secrets에 `CLOUDFLARE_DEPLOY_TOKEN`, `CLOUDFLARE_STATEFUL_TOKEN`, `CLOUDFLARE_TOPOLOGY_TOKEN`을 등록한다.
3. staging branch에서 각 release unit이 전용 token으로 성공하는지 검증한다.
4. production candidate 0% 또는 Pages preview gate까지 통과하는지 확인한다.
5. 모든 경로가 검증된 뒤 workflow에서 legacy token fallback을 제거한다.
6. 기존 광범위 token은 폐기하거나 emergency break-glass 용도로 별도 보관한다.

전환 전에는 기능을 멈추지 않고, 전환 완료 전에는 기존 token을 조기에 삭제하지 않는다. 권한 축소 때문에 정상 배포가 중단되는 상황도 운영 장애이므로 단계적으로 전환한다.

정책의 기계 판독 버전은 `config/cloudflare-access-profiles.json`에 둔다.
