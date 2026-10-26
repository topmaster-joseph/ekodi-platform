# 동행 서버 함수(singles-api) 자동 배포 경로 (운영 중)

기준일: 2026-10-26 · 상태: **2단계 운영 · 실제 경로 확인됨** — 2026-10-26 첫 수동 실행(run 40244545699)으로 v8 배포·검증. 이후 동행 서버 함수 변경은 **에코디 릴리스 병합 직후 봇이 배포를 시작**하는 경로로 자동 배포된다(아래 0절). 이전 표기 "`main` push 자동 배포"는 실제로 한 번도 실행되지 않았으므로 바로잡는다.

## 0. 실제 자동 배포 경로 (2026-10-26 실증)

| 단계 | 누가 | 실증 (P2-1 API, `54a09e2`) |
|---|---|---|
| 1. 작업 브랜치 PR 검사 | `deploy-singles-api.yml`의 `validate`(타입·회귀) | run 40247475593 성공 |
| 2. 에코디 릴리스 PR(`ai/<agent>/orch_recovery_*`) 생성·병합 | 에코디 봇(`github-actions[bot]`) — `converge-orchestrated-pr-merge.mjs` | 00:04:55 UTC 병합 |
| 3. **배포 시작** | 같은 수렴 스크립트가 병합 직후 `deploy-singles-api.yml`을 `workflow_dispatch`로 시작(`singlesApiTouched`) | 00:04:58 UTC, run 40247610405 |
| 4. 출처 확인 → DB 칸·함수 확인 → 배포 → 배포 후 확인(실패 시 자동 롤백) | `production` 작업 | 모두 성공, 운영 `singles-api` v8 → v9 |

- 봇 토큰으로 병합하면 GitHub가 `push` 이벤트를 만들지 않는다. 그래서 워크플로의 `push` 트리거는 봇 릴리스에서는 동작하지 않고, 사람이 직접 병합한 경우에만 쓰인다. 자동 배포의 실제 주체는 3단계 디스패치다.
- 이 경로는 `test/singles-api-deploy-lane.test.mjs`(수렴 스크립트가 이 레인을 디스패치하는지)로 보호된다.
- 배포 레인을 깨우는 파일: `supabase/functions/singles-api/**`, `config/singles-api-db-contract.json`, `scripts/singles-api-db-preflight.mjs`, `.github/workflows/deploy-singles-api.yml`.

### 릴리스 PR의 빨간 "실패" 표시 (CONVERGE-UNAPPROVED-RUNS-001)
- 원인: 에코디 봇이 연 릴리스 PR에 붙는 `pull_request` 워크플로는 GitHub가 모두 "승인 필요(`action_required`)"로 세워 두고 실행하지 않는다. 병합 뒤 브랜치가 지워지면 이 대기 실행이 작업 0개짜리 "실패"로 바뀌어 릴리스마다 약 14개의 거짓 실패가 보였다.
- 영향: 없음. 릴리스 근거는 작업 브랜치 PR 검사와 오케스트레이터 상태값이며, 대기 실행은 한 번도 돌지 않는다.
- 조치: 수렴 스크립트가 병합 직전에 같은 릴리스 head의 봇 대기 실행만 취소한다(`scripts/lib/converge-unapproved-runs.mjs`). 실패해도 릴리스를 막지 않는다.

구현 결정: DB 선행조건은 Management API 읽기 전용 쿼리(`scripts/singles-api-db-preflight.mjs`, 계약 `config/singles-api-db-contract.json`)로 확인하고, SQL 함수 `singles_api_contract()`는 만들지 않음. 배포 후 확인 실패 시 직전 `main` 소스로 자동 롤백.

## 1. 왜 필요한가
- `singles-api` Edge 함수를 배포하는 GitHub 워크플로가 없다. 그래서 v5~v7은 작업 세션에서 직접 배포했다.
  배포 후 저장소와 바이트 단위로 대조했지만 오케스트레이터 릴리스 영수증이 남지 않았다.
- 같은 저장소의 `deploy-access-api.yml`은 이미 검증된 경로를 쓴다:
  오케스트레이터 출처 확인 → 배포 가드레일 → Supabase CLI 배포 → 도달성 확인.
  이 경로를 그대로 따른다.

## 2. 제안 워크플로 `.github/workflows/deploy-singles-api.yml`

| 단계 | 내용 | 근거 |
|---|---|---|
| 트리거 | PR: `supabase/functions/singles-api/**`, `test/singles-*.test.mjs`, 워크플로 자신 → 검증만 / **에코디 릴리스 병합 후 수렴 스크립트의 `workflow_dispatch`(release_branch_ref, release_task_id) → 배포** / `main` push(같은 경로)는 사람이 직접 병합한 경우만 | access-api와 동일 |
| validate | `deno check supabase/functions/singles-api/index.ts`, `node --test test/singles-*.test.mjs` | 타입·회귀 |
| 출처 확인 | `scripts/validate-ekodi-ai-change-orchestration.mjs --release`, `scripts/validate-deployment-guardrails.mjs` | 오케스트레이터 영수증 없는 배포 차단 |
| DB 선행조건 | 배포 전에 필요한 DB 함수가 운영에 있는지 확인(아래 3절). 없으면 배포 중단 | 서버 함수가 DB보다 먼저 나가면 쓰기 전체가 503 |
| 배포 | `npx --yes supabase@2.116.0 functions deploy singles-api --project-ref "$PROJECT_REF"` — **`--no-verify-jwt`를 붙이지 않는다**(현재 운영은 verify_jwt=true) | access-api와 달리 JWT 검사 유지 |
| 배포 후 확인 | 토큰 없이 `/functions/v1/singles-api/me` 호출 → 401, 배포된 버전 번호 증가 확인 | 도달성 + 게이트 확인 |
| 롤백 | 확인 실패 시 직전 `main` 커밋의 `singles-api` 폴더로 같은 명령 재배포 | 자동 복구 |
| 직렬화 | `concurrency: ekodi-singles-api-production` | 동시 배포 방지 |
| 비밀값 | 기존 `SUPABASE_ACCESS_TOKEN`(production environment) 재사용, 새 비밀 추가 없음 | 최소 권한 |

## 3. DB 마이그레이션과의 순서
- 현재 동행 마이그레이션은 사람이 승인한 뒤 운영 DB에 직접 적용한다. 사이트 배포 레인은 DB를 다루지 않는다.
- 제안: `singles_api_contract()` SQL 함수를 하나 둔다(service_role 전용).
  서버 함수가 기대하는 DB 함수가 모두 있는지 `to_regprocedure`로 검사해 true/false만 반환한다.
  - 대상: `singles_rate_take`, `singles_withdraw_member`, `singles_report_review`,
    `singles_bank_confirm_order`, 앞으로 추가되는 함수
- 배포 레인은 배포 전에 이 함수를 호출하고, false면 배포를 멈춘다.
  "마이그레이션 먼저, 서버 함수 나중"이라는 순서가 사람의 기억이 아니라 자동 검사로 지켜진다.
- 호출 방법은 확인필요다. Management API의 SQL 실행 경로와 service_role 키로 RPC를 부르는 경로 중 하나로 정해야 한다.
  service_role 키를 CI에 새로 두는 것은 권한이 커지므로 Management API 쪽을 우선 검토한다.

## 4. 도입 순서
1. `singles_api_contract()` 마이그레이션 + 테스트(운영 적용은 승인 후)
2. `deploy-singles-api.yml` 추가. 처음에는 `workflow_dispatch`만 열어 수동 1회 실행으로 검증한다.
3. 검증되면 자동 배포를 켠다 → 완료: 릴리스 병합 직후 수렴 스크립트가 디스패치(0절).
4. 이후 동행 서버 함수 변경은 이 경로로만 배포한다. 작업 세션의 직접 배포는 중단한다.

## 5. 결정·확인 필요
- 위 3절 DB 선행조건 확인을 Management API로 할지(권장) 여부
- 자동 롤백을 켤지, 실패 시 알림만 할지
- 직접 배포한 v5~v7의 출처 기록을 EKODI 릴리스 기록에 어떻게 남길지
