# EKODI Control API — 배포 성공과 GitHub 상태 전송 실패 분리 (2026-11-07)

## 운영 증거

보호된 Control API 릴리스 실행: [#42378442479](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42378442479), SHA `1cb3c58294fcea19c6668fadee15c9f65f602bc6`.

- `validate` / `staging` 성공, 운영 후보 0% 헤더 검사 성공.
- `scripts/guarded-worker-release.mjs`의 실제 로그에 `Phase 3/3`, 신규 Worker 100% 승격, 운영 URL 보안 헤더·본문 검증, 버전 attestation 일치, `Guarded Worker release complete` 기록 확인.
- 배포 이후 별도의 `Publish Control API production status`에서 `POST /statuses/<SHA>`가 HTTP 403 `API rate limit exceeded for installation` 응답. 이 단계만 실패하여 GitHub Actions 전체 실행은 **failure**이며 required legacy status 기록을 보장할 수 없다.
- **판정 분리:** 실서비스 후보 승격과 검증은 로그상 성공. GitHub 메타데이터 게시 실패는 여전히 실패로 보관. 성공 상태를 생성하거나 API 할당량을 우회해서는 안 된다.

## 본 작업 #8742

기존 `scripts/github-status-transient.sh`는 quota 403/429에 대해 비밀 없는 진단·회로차단·fail-closed 기능을 이미 제공한다. 최종 Control API 워크플로가 이 함수를 **명시적으로 호출**하도록 개선하고 회귀 테스트를 추가한다.

- GitHub POST 성공 없이는 메타데이터 성공으로 인정하지 않는다. 403/429 또는 권한 부족이면 스텝 실패 상태 유지.
- 원본 배포 단계의 합법적 진위·attestation·보호된 0%/100% 승격 코드는 변경하지 않는다.
- 자동 재배포나 새 운영 비밀키 발급, 인증·권한 확장, status 결과 위조를 하지 않는다.
- 전송 성공 여부와 실제 서비스 검증은 독립적으로 보고한다.

## 필요한 운영 후속

1. 사용 가능할 때 GitHub 앱 설치계정의 API 한도/권한을 확인한다. 관리자 권한·토큰 추가 없이 할당량 회복을 기다리거나 승인된 관리자 보호 워크플로를 이용한다.
2. 동일한 운영 Worker release/version attestation과 운영 canary를 **읽기 전용으로** 재검증하고 SHA·버전·검증 시각을 함께 보관한다.
3. 허가된 EKODI 오케스트레이터가 exact SHA의 **진짜 status 게시**를 별도 복구 실행으로 수행할 때만 GitHub status 성공으로 간주한다. 실서비스 재배포를 단순 status 재전송 용도로 실행하지 않는다.
4. 이 task PR은 오케스트레이터의 독립 recovery PR, 필수 CI, 검토 및 릴리스 게이트를 통과해야 한다. `AI_ROUTE_FAMILY_AUTO_DISPATCH`는 기본 비활성 상태로 유지한다.

단순히 “GitHub 실패”라는 이유만으로 이미 승격된 Worker를 다시 변경하거나, 반대로 GitHub 기록이 누락됐다는 사실을 숨겨서는 안 된다.
