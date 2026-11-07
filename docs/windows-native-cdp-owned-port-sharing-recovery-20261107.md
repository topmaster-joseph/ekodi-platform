# EKODI Windows Native CDP — 전용 프로필 포트 파일 점유 복구

**작업:** #8751. 선행 실패: [Device Control Windows CI #42382491853](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42382491853), Windows job #128432864463.

## 검증된 장애

- 기존 Windows Device Agent는 전용 Task-UUID Chrome/Edge 프로필로 헤드리스 CDP를 시작하고 `DevToolsActivePort` 파일을 찾는다.
- CI 로그에서 전용 CDP canary 성공 이후 다음 실제 browser worker의 `Get-Content`가 `The process cannot access the file ... because it is being used by another process` 예외로 실패했다.
- 이것은 브라우저 새로고침·UI 편집 문제가 아니라 **브라우저가 포트 파일을 처음 생성하는 짧은 쓰기 잠금과 Windows PowerShell 읽기의 경합**이다. Chrome 프로필 격리·비공개 데이터 보호 정책을 약화할 근거가 아니다.

## 최소 수정

- `Invoke-EkodiHeadlessScreenshot`에서 생성된 **자체 Task-UUID 프로필의 포트 파일만** 읽는다.
- 신설 `Read-EkodiOwnedDevToolsPort`는 `Get-Content -LiteralPath -ErrorAction Stop`을 1회 시도한 후 Windows `ERROR_SHARING_VIOLATION=32`, `ERROR_LOCK_VIOLATION=33`인 `System.IO.IOException`에만 최대 8회·120ms 간격으로 재시도한다.
- 파일 없음, 권한 오류, 형식 오류, 임의 오류는 더 넓은 파일 경로 접근이나 프로세스 재시작 없이 실패 폐쇄한다. 잠금이 계속되면 `cdp_port_file_locked` 단순 코드만 반환해 사용자 프로필 경로를 노출하지 않는다.
- 포트는 정수·1~65535 범위로 검증한다. WebSocket 연결, 도메인·브라우저 프로필/탭 격리, 읽기 전용 렌더링, 사용자 창/클립보드 보호, 프로필·캡처 삭제, 권한 정책 등은 변경하지 않는다.

## 필수 검증

- `node --test test/windows-owned-cdp-port-lock.test.mjs` 및 기존 CDP 계약 테스트
- 실제 Windows runner의 **필수** Native Background Browser canary (검사 제외나 `continue-on-error` 금지)
- 헌법, AI 오케스트레이션, 전체 CI, 자동 충돌 가드
- EKODI 보호된 복구 PR 병합 후에도 실제 사용자 PC와 구독 AI 실행기 증거는 별도 검증한다.

**상태:** 소스 변경/회귀 테스트 제출. CI 전후로 실제 안정성이 확인되기 전 '복구 완료' 주장 금지.
