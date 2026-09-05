# EKODI Site Lifecycle

EKODI는 기존 사이트를 다시 만드는 방식으로 전환하지 않는다. 기존 공개 주소와 화면을 우선 보존하고, 내부 정체성·권한·데이터만 Workspace/Core 기준으로 승격한다.

## 생성 순서

1. 가입: Person / EKODI ID만 생성한다.
2. Workspace 생성: 개인·점포·기관·단체·프로젝트의 독립 운영주체를 만든다.
3. 정식 slug 확정: `workspace_id`를 유지한 채 공개 사용자 사이트를 자동 프로비저닝한다.
4. 서비스 활성화: Marketing AI 등 선택 서비스는 실제 필요 시점에 JIT로 연결한다.
5. Legacy 정리: 새 canonical surface 검증 뒤에만 redirect/compatibility alias로 전환한다.

URL은 신분증이 아니다. 인증과 권한의 기준은 항상 immutable `workspace_id` 또는 그 하위 `store_id`다.
## 사용자·관리자 Surface 쌍

Store Workspace의 사용자 화면과 관리자 화면은 서로 다른 사이트가 아니다. 하나의 Workspace에 역할이 다른 두 Surface를 제공한다.

- 사용자/운영 Surface: `https://ekodi.kr/{slug}`
- 관리자 Surface: `https://ekodi.kr/{slug}/admin`
- 공통 관리자 엔진: `store-admin`
- 실제 데이터·권한 경계: immutable `workspace_id` / `store_id`

따라서 `jadam-store-admin`, `pizzamaru-store-admin` 같은 점포별 관리자 엔진을 늘리지 않는다. `store-admin + workspace context` 하나를 사용하며, 새 Store Workspace의 canonical slug가 프로비저닝되면 사용자 Surface와 관리자 Surface가 한 쌍으로 제공된다. URL 별칭은 canonical 주소로 정규화하되 권한 기준으로 사용하지 않는다.

## 기존 사이트 처리 원칙

- **유지 + 연결**: 정상 운영 중인 사이트는 화면과 주소를 먼저 유지한다.
- **Workspace 승격**: 기존 사이트를 Workspace 소유·권한·데이터에 연결한다.
- **Service 분리**: 공통 플랫폼/AI 기능은 사이트가 아니라 Service로 관리한다.
- **Legacy redirect**: 중복 주소는 canonical 검증 뒤에만 넘긴다.
- **삭제 선행 금지**: 대체 사이트가 검증되기 전에 기존 공개 사이트를 제거하지 않는다.

## 현재 분류

| Workspace | 현재/정식 공개면 | 처리 |
| --- | --- | --- |
| 자담치킨 목포대점 | `ekodi.kr/jadam` | 기존 사이트를 Store Workspace에 승격 완료 |
| 피자마루 목포대점 | `ekodi.kr/pizzamaru` | 기존 사이트를 Store Workspace에 승격 완료 |
| 요거트퍼플 목포대점 | `ekodi.kr/yogurt` | 승격 완료, `/yogurtpurple`은 별칭 |
| 청계면상인회 | `ekodi.kr/cgma`, `cgma.or.kr` | 기존 사이트·고객 소유 도메인 유지 후 Core 연결 |
| 에코디교회 | `ekodi.kr/ekodichurch`, `church.ekodi.kr` | 기존 공개면 유지 후 Workspace/Core 연결 |
| 에코디비즈 | `ekodi.kr/ekodibiz`, `biz.ekodi.kr` | 기존 공개면 유지 후 Workspace/Core 연결 |
| 에코디연구소 | `ekodi.kr/ekodilab`, `lab.ekodi.kr` | 기존 공개면 유지 후 Workspace/Core 연결 |
| EKODI Global Trading | `trade.ekodi.kr` | URL 변경 없이 Core 연결, canonical 결정은 보류 |
| 에코디 카페 | `cafe.ekodi.kr` | 준비 상태 유지, 실제 운영 중인 것처럼 표시하지 않음 |

공통 Service는 이 표의 Workspace 사이트와 별개다. `ecosystem-services.json`의 Live/Beta Service는 등록된 서비스 경계를 유지하고, Preparing/Planned Service는 준비가 끝나기 전 새 Workspace 사이트처럼 자동 생성하지 않는다.

구조적 소스 오브 트루스는 `config/site-lifecycle-registry.json`이며 `npm run validate:site-lifecycle`가 다른 Workspace/Service 정책과의 불일치를 차단한다.
