# EKODI Site Lifecycle

EKODI는 기존 데이터와 Workspace 정체성을 보존하되, 공개 주소는 `ekodi.kr` 하위 경로로 통일한다. URL은 권한의 근거가 아니며 인증·권한의 기준은 immutable `workspace_id` 또는 해당 도메인의 고유 ID다.

## 생성 순서

1. 가입 시 Person / EKODI ID만 생성한다.
2. Workspace를 만든다.
3. 정식 slug 확정 시 `workspace_id`를 유지한 채 `https://ekodi.kr/{slug}` 공개 사이트를 프로비저닝한다.
4. Marketing AI 등 선택 서비스는 필요 시 JIT로 `/{slug}/{service}`에 연결한다.
5. 기존 주소 정리 시 redirect-only 서브도메인을 만들지 않는다. 대체 경로가 검증되면 이전 공개 서브도메인/호스트 라우팅을 제거한다.

## 운영 원칙

- 정상 운영 데이터와 소유권은 유지한다.
- 공개 사이트는 Workspace/Core 권한 모델에 연결한다.
- 공통 기능은 Site가 아니라 Service로 분리한다.
- 공개 EKODI 주소는 apex path만 사용한다.
- 서브도메인은 공개 사이트·리다이렉트·호환 별칭으로 사용하지 않는다.
- 내부 실행은 service binding/private Worker를 사용한다.
- 고객 소유 외부 도메인은 승인된 직접 매핑으로만 유지한다.
- 검증된 대체면 없이 기존 서비스를 먼저 삭제하지 않는다.

## 현재 공개면

| Workspace | 정식 공개면 | 처리 |
| --- | --- | --- |
| 자담치킨 목포대점 | `ekodi.kr/jadam` | Store Workspace 승격 |
| 피자마루 목포대점 | `ekodi.kr/pizzamaru` | Store Workspace 승격 |
| 요거트퍼플 목포대점 | `ekodi.kr/yogurt` | Store Workspace 승격 |
| 청계면상인회 | `ekodi.kr/cgma` + 승인된 고객 소유 도메인 | Core 연결 |
| 에코디교회 | `ekodi.kr/ekodichurch` | Workspace/Core 연결 |
| 에코디비즈 | `ekodi.kr/ekodibiz` | Workspace/Core 연결 |
| 에코디연구소 | `ekodi.kr/ekodilab` | Workspace/Core 연결 |
| EKODI Global Trading | `ekodi.kr/ekodibiz/trade` | 서비스 경로로 연결 |
| 에코디 카페 | apex canonical 경로 확정 전 공개하지 않음 | 준비 상태 |

공통 Service는 Workspace 사이트와 별개다. Live/Beta라도 canonical 공개 주소가 apex 경로로 등록되지 않은 서비스는 Discovery 공개 목록에 자동 진입하지 않는다.

구조적 원장은 `config/site-lifecycle-registry.json`, 공개주소 헌법은 `config/domain-canonical-policy.json`이며 CI가 두 정책의 불일치를 차단한다.
