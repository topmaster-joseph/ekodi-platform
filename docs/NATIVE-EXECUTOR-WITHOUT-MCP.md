# EKODI 자체 실행기 — MCP 없이 사용

MCP 외부 연결과 별개로 EKODI Control API, 중앙 작업 큐, 등록된 EKODI Windows Device Agent, 자체 백그라운드 브라우저 워커를 사용합니다. 새로운 외부 브라우저 SaaS나 인증 우회용 API를 설치하지 않습니다.

## 실행 순서

1. EKODI 관리자 계정으로 `https://ekodi.kr/admin/status/devices` 에 로그인합니다. 관리자 로그인이 유지되지 않으면 먼저 그 로그인 장애를 해결해야 하며, 브라우저 작업을 무인 인증 우회로 실행할 수 없습니다.
2. 실행 인프라의 **실행 노드**에서 해당 Windows PC의 heartbeat가 **온라인**인지 확인합니다.
3. **BG Browser Canary**를 등록된 장치에 실행합니다. 결과가 실제 통과해야 `backgroundBrowser` capability를 광고할 수 있습니다. canary 실패 시 장치를 준비 상태로 간주하지 않습니다.
4. 노드가 실제 데스크톱으로 확인됐고 자동 실행 요건을 충족할 때에만 관리자가 노드의 **사용 / 자동 실행**을 켭니다. 전력·메모리·부하 및 동시 실행량 제한은 서버에서 다시 검사합니다.
5. **자체 브라우저 실행 · MCP 불필요** 입력창에 `/ai/` 또는 `/admin/services/common-services?service=ai` 같은 EKODI 내부 경로를 입력하고 화면 크기를 선택합니다.
6. **자체 실행 요청**을 누르고 명시적 확인을 승인합니다. 실제 `POST /api/control/hybrid-execution/jobs`에는 `taskType: computer.browser.execute`, `payload: {path,deviceProfile}`, `confirmed: true`, `maxAttempts: 1`가 전달됩니다. **작업 등록**은 **작업 완료**가 아닙니다.
7. 아래 **실행 기록·감사 이벤트**에서 `pending → assigned → leased → completed`와 장치/완료 시각을 확인합니다. `auth_required`, `failed`이면 작업이 완료된 것으로 처리하지 않습니다.

## 안전 규칙

- URL은 `ekodi.kr`의 내부 상대 경로만 허용하고, 외부 사이트·임의 셸 명령·URL 인증 토큰·URL 해시는 거부합니다. 서버에서도 동일 출처와 작업 유형을 재검증합니다.
- EKODI 작업 실행은 검증된 전용 프로필의 headless/off-screen 브라우저에서만 가능합니다. 사용자의 Opera/Chrome 탭·키보드·클립보드를 조작하거나 로그인을 자동 진행하지 않습니다.
- 미인증 요청, 서버의 HTTP 401/403, 필요한 인증이 없는 페이지는 `AUTH_REQUIRED` 후 종료됩니다. 실제 Google 관리자 로그인·기존 GitHub 로그인은 사용자의 별도 인증 권한이 필요합니다.
- GitHub 외부 URL에 대한 작업·`Approve and run workflows` 클릭은 이 내부 웹 점검 기능의 범위 밖입니다. PR #4019의 GitHub 승인 차단이 이 화면만으로 해소됐다고 주장하지 않습니다.
- 오프라인·노드 canary 미검증·실행망 일시중지 상태에서는 실행 버튼을 비활성화합니다. 서버 큐와 노드 가용성은 최종 결정권을 유지합니다.
- 이 화면은 기존 관리자 세션이 필요하지만 **ChatGPT 측 EKODI MCP 연결은 필요하지 않습니다.**

## 운영 전 검증

이 변경은 관리자 UI에 기존 검증된 실행 API를 연결하는 소스 수정입니다. 검증: 정적 경로·보안 회귀 테스트, 기존 전체 CI, 실제 EKODI 온라인 노드에서 Canary → 작업 등록 → 영수증 확인, 보호된 스테이징·운영 배포와 사용자/관리자 브라우저 확인을 모두 통과한 뒤 운영 완료로 보고해야 합니다.

등록된 온라인 노드가 없거나 관리자 Google 로그인이 유지되지 않으면 **UI 구현만으로 실제 자체 실행이 가능해지는 것은 아닙니다.** 그 상태를 명확하게 드러내고 무인 인증·에이전트 등록을 우회하지 않습니다.

## CGMA 게시판 실제 관리자 글쓰기 실증

EKODI 자체 브라우저 실행기의 **CGMA 게시판 자체 점검**은 공개 페이지에 대한 읽기 전용 검증입니다. 사용자의 Google/EKODI 로그인 토큰을 격리 에이전트로 옮기지 않으므로 실서비스 관리자 글쓰기 E2E 완료를 뜻하지 않습니다.

관리자가 직접 `https://ekodi.kr/admin/`에 로그인한 상태에서는 **실행 인프라 · 작업 관제 → CGMA 로그인 관리자 · 1회성 글쓰기 실증**을 선택할 수 있습니다. 버튼은 관리자 제어 권한과 현재 세션이 있을 때만 활성화됩니다. 실행 직전 실제 운영 데이터에 임시 게시글 한 건을 남겼다가 소프트삭제한다는 사실을 다시 확인합니다.

검증은 고유 제목의 임시 글 **1건**만 생성한 뒤, 서버에서 반환한 ID로 해당 글의 제목·본문을 확인하고 수정·재조회·소프트삭제합니다. 게시글 상세 404 및 공개 목록 미노출을 확인하며, 중간 실패 시 소유한 임시글임을 확인한 경우에 한하여 자동 정리합니다. 정리가 실패하면 ID를 관리자 화면에 표시합니다. 기존 글·회원권한·소유자·보드 lifecycle은 변경하지 않습니다. 실서버가 401/403을 반환하면 종료하며 무인 로그인·인증 우회는 하지 않습니다. 서버 감사기록 및 타 계정의 거부 응답까지 별도로 확인한 후에만 최종 실증 완료로 판정합니다.


## Protected-base 재검증 기록

EKODI Orchestrated PR Convergent Merge가 이 release branch를 최신 보호된 `main`과 동기화한 뒤, GitHub가 bot-authored 동기화 commit의 pull-request workflow를 `action_required`로 분류했습니다. 이 문서 전용 owner-authored 변경은 동기화된 현재 head에서 필수 CI와 Orchestration Gate를 다시 실행하기 위한 검증 트리거입니다.

실행 코드, 권한, Human Gate, 배포 범위, MCP 선택성 계약 값은 변경하지 않습니다. 필수 검증을 우회하거나 성공으로 간주하지 않으며, 새 head에서 실제 required checks가 통과하고 보호 병합이 완료되기 전에는 운영 완료로 판정하지 않습니다.
