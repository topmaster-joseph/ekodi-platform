# Control API — 운영 배포 완료와 GitHub 상태 게시 실패의 분리

## 확인된 사실

- 보호 배포 실행: [#42378442479](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42378442479)
- 대상 병합 SHA: `1cb3c58294fcea19c6668fadee15c9f65f602bc6`
- `validate`, `staging` 작업 성공. 운영 배포에서 0% 후보의 청계 비공개 API 캐시 헤더 검증을 포함한 후보 검증 통과.
- 후보를 Cloudflare Worker 버전 `a4aa3162-5330-4019-82cd-d9c5ad7179aa`으로 **100% 승격**, 운영 URL 재검증 통과. 로그에는 `Guarded Worker release complete` (2026-11-07 13:50:18 UTC).
- 마지막 `Publish Control API production status` 단계가 2026-11-07 13:50:40 UTC GitHub App installation API 기본 호출 한도 초과로 403을 받음. 따라서 **GitHub Actions 실행 결과는 failure**이며 GitHub 커밋 상태 게시 성공 증거는 없음.
- 앞선 실패 실행 #42319521539는 0% 후보 보안 헤더 불일치에 의한 **실제 후보 롤백**이었으므로 이번 성공 승격과 구분해야 한다.

## 최소 안전 보완

`.github/workflows/deploy-control-api.yml` 마지막 `always()` 상태 게시 단계에서 기존 `scripts/github-status-transient.sh`를 사용해 응답 분류를 통일한다. GitHub 403은 `quota_primary`·`quota_secondary`·`permission_denied`로 구분되며, 공개 Step Summary에는 오류 종류와 상태코드만 남긴다. 사용자 데이터·토큰·원시 오류 본문을 넣지 않는다.

**실패를 성공으로 치환하지 않는다.** GitHub API 게시가 실패하면 Actions 작업도 계속 실패하며, 신뢰되지 않는 성공 상태를 만들지 않는다. 별도의 운영 배포를 자동으로 재시작하거나 롤백·승격 로직을 바꾸지 않는다.

## 후속 필수 검증

1. GitHub App rate limit 정상화 이후, EKODI 승인된 배포 검증 전용 절차에서 정확한 실행 ID·SHA·Cloudflare 버전·실제 서비스 응답·가드 기록을 검증한다.
2. 성공 상태 정정·추가 게시 권한이 필요한 경우 별도의 EKODI 권한 게이트에서 명시적으로 검토한다. 작업자 PR이 GitHub REST 상태를 임의로 만들어서는 안 된다.
3. 실제 현재 운영 Worker 버전과 청계 비공개 헤더를 재확인하고, 오류율·CPU 등 운영 관측자료가 확보돼야 전체 운영 완료라고 주장할 수 있다.
4. 헌법 검사, GitHub 보호된 CI 및 공식 `orch_recovery` PR 이후에만 상태 수송 보완을 릴리스한다.

관련: #8726, #8707. `AI_ROUTE_FAMILY_AUTO_DISPATCH`는 기본 OFF이며 이 변경으로 활성화하지 않는다.
