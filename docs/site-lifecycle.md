# EKODI Site Lifecycle

EKODI는 기존 사이트의 기능과 데이터를 보존하면서 Workspace/Core로 승격한다. 2026-10-23 승인된 C3 정책에 따라 모든 직접 운영 웹사이트의 공식 주소는 `https://ekodi.kr/{site}` 경로이며, 과거 EKODI 웹 서브도메인은 보조 주소·리디렉션이 아니다.

## 생성 순서

1. 가입: Person / EKODI ID만 생성한다.
2. Workspace 생성: 개인·점포·기관·단체·프로젝트의 독립 운영주체를 만든다.
3. 정식 slug 확정: `workspace_id`를 유지한 채 공개 사용자 사이트를 자동 프로비저닝한다.
4. 서비스 활성화: Marketing AI 등 선택 서비스는 실제 필요 시점에 JIT로 연결한다.
5. Legacy 정리: 정식 경로·로그인·외부 콜백·권한 검증 후 보호된 C3 릴리스에서 웹 서브도메인 바인딩과 HTTP DNS만 폐기한다. 리디렉션 별칭을 남기지 않는다.

URL은 신분증이 아니다. 인증과 권한의 기준은 항상 immutable `workspace_id` 또는 그 하위 `store_id`다.

웹 서브도메인 폐기는 이메일 주소의 도메인 삭제가 아니다. 메일 발송·수신을 위한 MX/SPF/DKIM/DMARC 및 도메인 소유 확인용 DNS는 별도 검증 전까지 유지한다. 고객이 직접 소유한 독립 도메인도 에코디 웹 호스트 폐기 대상에서 제외한다.

## 기존 사이트 처리 원칙

- **기능 유지 + 공식 경로 연결**: 화면·데이터는 보존하고 직접 운영 웹 주소는 `ekodi.kr/{site}`로 통일한다.
- **Workspace 승격**: 기존 사이트를 Workspace 소유·권한·데이터에 연결한다.
- **Service 분리**: 공통 플랫폼/AI 기능은 사이트가 아니라 Service로 관리한다.
- **Legacy 웹 서브도메인 폐기**: 검증 후 Worker/Pages 바인딩과 HTTP DNS를 제거한다. 리디렉션은 완료 상태가 아니다.
- **삭제 선행 금지**: 대체 사이트가 검증되기 전에 기존 공개 사이트를 제거하지 않는다.

## 현재 분류

| Workspace | 현재/정식 공개면 | 처리 |
| --- | --- | --- |
| BBQ 무안청계점 | `ekodi.kr/bbqcg` | 기존 고객 소유 점포 Workspace에 자동 프로비저닝되어 운영; 중앙 고객 목록에 활성 표시 |
| 자담치킨 목포대점 (퇴역 이력) | `ekodi.kr/jadam` | 활성 사이트 목록에서는 제외; 과거 매출·주문·인증·회계 기록 및 독립 관리자 경계 보존. 별도 승인 없이 DB 물리 삭제 금지 |
| 피자마루 목포대점 | `ekodi.kr/pizzamaru` | 기존 사이트를 Store Workspace에 승격 완료 |
| 요거트퍼플 목포대점 | `ekodi.kr/yogurt` | 승격 완료, `/yogurtpurple`은 별칭 |
| 청계면상인회 | `ekodi.kr/cgma`, `cgma.or.kr` | 기존 사이트·고객 소유 도메인 유지 후 Core 연결 |
| 에코디교회 | `ekodi.kr/ekodichurch` | 공식 경로 단독 사용; 기존 웹 서브도메인은 C3 보호 폐기 대상 |
| 에코디비즈 | `ekodi.kr/ekodibiz` | 공식 경로 단독 사용; 기존 웹 서브도메인은 C3 보호 폐기 대상 |
| 에코디연구소 | `ekodi.kr/ekodilab` | 공식 경로 단독 사용; 기존 웹 서브도메인은 C3 보호 폐기 대상 |
| EKODI Global Trading | `ekodi.kr/trade` | 공식 경로 이용; 기존 웹 서브도메인은 검증 후 폐기 |
| 에코디 카페 | `ekodi.kr/cafe` (예정) | 준비 상태; 경로 연결·운영 완료를 사칭하지 않음 |

공통 Service는 이 표의 Workspace 사이트와 별개다. `ecosystem-services.json`의 Live/Beta Service는 등록된 서비스 경계를 유지하고, Preparing/Planned Service는 준비가 끝나기 전 새 Workspace 사이트처럼 자동 생성하지 않는다.

구조적 소스 오브 트루스는 `config/site-lifecycle-registry.json`이며 `npm run validate:site-lifecycle`가 다른 Workspace/Service 정책과의 불일치를 차단한다.
