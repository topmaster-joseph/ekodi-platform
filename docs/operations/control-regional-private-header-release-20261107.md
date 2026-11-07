# Control API — 청계 비공개 상태 헤더 복구

## 확인된 장애

- 기준 Control API 배포: GitHub Actions [#42319521539](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42319521539).
- 대상 병합 SHA: `ef7e77a7858c67c1d80ad526dc979d62f5758d7b`.
- Staging/DB migration 통과 후 production의 **0% 후보 검증**에서 `GET https://ekodi.kr/api/local-operations/cheonggye/modules/directory` 실패.
- 응답 404, `REGIONAL_PUBLICATION_PRIVATE`, `x-ekodi-route: regional-private-hold`는 정상. 반면 필수 헤더 `cache-control: private, no-store`가 확인되지 않음.
- Guarded release가 자동 롤백을 수행했고 rollback verification은 성공. **실서비스 배포 성공으로 표시하면 안 됨.**

## 수정 범위

- 기존 `CHEONGGYE_PUBLICATION_HOLD=true`는 그대로 유지. 공개 승인, 인증 우회, 200 응답 변경, 검색 노출 또는 캐시 허용을 하지 않음.
- `security-edge.js`의 **마지막 Control API 응답 처리**에서 *404 + 두 개의 정확한 owner-hold 헤더*가 동시에 있는 경우 `Cache-Control: private, no-store, max-age=0`를 고정한다. `X-Robots-Tag`에 `noindex,nofollow,noarchive,nosnippet`를 유지하고 CDN 캐시 관련 헤더를 제거한다.
- 위 조건을 만족하지 않는 일반 API의 기존 `no-store` 정책은 변경하지 않는다.
- `deploy/manifests/control-api.worker.json`의 엄격한 `headerExpect` 검사는 그대로 둔다. 검증 조건 완화로 릴리스 실패를 가리지 않는다.
- `test/control-private-regional-hold-cache.test.mjs`에서 실제 customer entry 응답, 캐시 정규화가 중간에 일어난 상황, 일반 API 비회귀, 배포 검증 계약을 검사한다.

## EKODI 검증·배포 게이트

1. 보호된 task branch CI에서 관련 Node tests, Constitution, AI Orchestration, Device Security 및 전체 CI 확인.
2. EKODI가 별도 `orch_recovery` PR을 만들고 exact HEAD SHA에 genuine required checks 통과.
3. 보호된 Control API staging 후 0% 후보 검증에서 **실제 헤더, 본문, 상태, 롤백 경로** 확인; 성공하면 100% 승격·경로 확인.
4. 운영 `ekodi.kr`에서 청계 public modules가 계속 404/비공개/noindex/private-no-store인지 검증. 인증 관리자 API는 기존 권한을 유지.
5. 실패하면 후보 배포 중지·롤백·원인 수정 후 새 검증. CI·PR·배포 호출만으로 완료 주장 금지.

관련 작업: #8707. 이 작업은 AI 자동 배정 스위치를 활성화하지 않는다. `AI_ROUTE_FAMILY_AUTO_DISPATCH`는 계속 기본 OFF.
