# EKODI Windows POS Agent

EKODI Store Console이 **현재 POS PC에서 실행 중인 Windows 프로그램의 상태를 확인하고, 사용자가 직접 `바로 전환`을 누른 경우에만 해당 창을 앞으로 가져오도록** 하는 로컬 에이전트입니다.

## 안전 원칙

- 서버는 `127.0.0.1` 또는 `localhost`에만 바인딩합니다. 외부 네트워크에는 열지 않습니다.
- 브라우저 Origin은 기본적으로 `https://ekodi.kr`만 허용합니다.
- 임의 프로그램 경로나 명령어를 웹 요청으로 받지 않습니다. 전환 가능한 대상은 로컬 설정 파일에 미리 등록된 ID만 허용합니다.
- 새 주문이나 알림만으로 창을 자동 전환하지 않습니다. `POST /v1/focus`는 Store Console에서 사용자가 직접 버튼을 누른 경우에만 호출됩니다.
- 프로그램 자동 실행은 대상별 `allowLaunch: true`를 명시한 경우에만 허용됩니다. 기본값은 꺼짐입니다.

## 설치

### 권장: 원클릭 설치

관리자 화면의 **POS 통합화면 → Agent 실행 · 중지 안내 → 원클릭 설치 (.cmd)** 를 사용합니다. 파일을 저장한 뒤 우클릭 → **관리자 권한으로 실행**하면 필요한 공식 Agent 파일을 같은 GitHub 저장소에서 임시 폴더로 내려받고 기존 설치 스크립트를 실행합니다.

`setup-pos-agent.cmd`는 다음 파일만 고정된 공식 저장소 경로에서 내려받습니다.

- `install-pos-agent.ps1`
- `EKODI-POS-Agent.ps1`
- `pos-agent.config.example.json`
- `diagnose-pos-targets.ps1`
- `start-pos-agent.cmd`
- `stop-pos-agent.cmd`
- `uninstall-pos-agent.ps1`

설치 전 패키지의 핵심 안전 마커를 확인하며, 실제 Agent 설치기는 기존과 동일하게 loopback-only 설정과 `https://ekodi.kr` 허용 Origin을 검증합니다.

### 고급: PowerShell 수동 설치

수동 설치를 사용할 때는 **현재 PowerShell 폴더에 install-pos-agent.ps1만 있는 것으로는 부족합니다.** 위 파일들이 같은 폴더에 있어야 하며, PowerShell의 현재 위치도 해당 폴더여야 합니다. 예를 들어 프롬프트가 `C:\Users\JG_Series>`인데 파일이 다운로드 폴더에 있다면 `-File .\install-pos-agent.ps1`은 “파일이 없습니다”로 실패합니다.

권장 방식은 POS PC에서 관리자 PowerShell을 한 번 열고 설치 스크립트를 실행하는 것입니다. 설치기는 기존 `pos-agent.config.json`을 보존하고, 새 Agent를 구문검사한 뒤 교체하며, 현재 Windows 사용자로 로그인할 때 자동 시작되는 `EKODI POS Agent` 예약 작업을 등록합니다. 창 전환은 로그인한 사용자의 대화형 세션에서만 정상 동작하므로 SYSTEM 계정으로 실행하지 않습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-pos-agent.ps1
```

처음 설치한 뒤 실제 POS 프로그램의 프로세스 이름과 창 제목을 확인하려면 다음 진단만 실행합니다. 이 스크립트는 어떤 프로그램도 실행·종료·전환하지 않습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\diagnose-pos-targets.ps1
```

그 결과를 보고 `%ProgramData%\EKODI\POSAgent\pos-agent.config.json`의 각 대상에 **프로세스 이름(확장자 제외)** 또는 **안정적인 창 제목 일부**를 입력합니다. 필요할 때만 `launchPath`에 설치 프로그램 또는 Windows 바로가기(`.lnk`)의 고정 경로를 넣고 `allowLaunch`를 `true`로 바꿉니다. 기본값은 자동실행 금지입니다.

설정 변경 뒤에는 Windows 작업 스케줄러에서 `EKODI POS Agent`를 다시 시작하거나, 로그아웃 후 로그인합니다. 설치 스크립트를 다시 실행하면 Agent 파일만 안전하게 업그레이드하고 기존 설정은 유지합니다.

수동 시험이 필요하면 설치 폴더에서 다음처럼 직접 실행할 수 있습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\EKODI-POS-Agent.ps1 -ConfigPath .\pos-agent.config.json
```

Windows가 `Access denied`로 로컬 리스너 시작을 막는 특수 환경에서는 관리자 PowerShell에서 **한 번만** 아래와 같이 정확한 loopback URL을 현재 사용자에게 예약할 수 있습니다.

```powershell
netsh http add urlacl url=http://127.0.0.1:17831/ user="$env:USERDOMAIN\$env:USERNAME"
```

브라우저가 처음 연결할 때 로컬 네트워크 접근 권한을 묻는 경우 `ekodi.kr`의 POS 통합화면 사용을 위해 허용합니다.

제거할 때는 관리자 PowerShell에서 다음을 실행합니다. 설정을 남기려면 `-KeepConfig`를 추가합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall-pos-agent.ps1
```

## CMPMYI 관리자에서 설치 · 삭제

여러 POS PC에 반복 설치할 때는 `https://ekodi.kr/cmpmyi/admin/agent`의 **POS Agent 설치·관리** 화면을 사용합니다. 최고관리자 메뉴의 **운영·배포·장애 → POS Agent 설치·관리**도 이 화면으로 연결됩니다.

- `setup-pos-agent.cmd` — 처음 설치 또는 업그레이드를 위한 원클릭 설치 파일입니다.
- `remove-pos-agent.cmd` — 예약 작업과 설치 폴더를 완전히 제거하는 원클릭 삭제 파일입니다. 실행 전에 확인을 받습니다.
- `start-pos-agent.cmd` / `stop-pos-agent.cmd` — 설치는 유지한 채 현재 Agent만 시작하거나 중지합니다.
- `diagnose-pos-targets.ps1` — 실제 POS 프로그램의 프로세스 이름과 창 제목을 읽기 전용으로 확인합니다.
- 관리화면은 현재 POS PC의 `http://127.0.0.1:17831/v1/health`를 확인해 Agent 버전·설정 대상·실행 대상을 표시합니다.

브라우저 보안상 웹페이지가 내려받은 Windows 설치·삭제 파일을 자동 실행할 수는 없습니다. 다운로드한 `.cmd` 파일은 **해당 POS PC에서 직접 실행**하며, Windows 관리자 권한 요청을 확인한 뒤 허용합니다.

## 실행 · 중지 파일

관리자 화면의 **POS 통합화면**과 CMPMYI **POS Agent 설치·관리** 화면에서 실행/중지 안내와 파일 링크를 제공합니다. 파일을 내려받아 실행할 수 있으며, 브라우저가 Windows 프로그램을 직접 실행하거나 종료하지는 않습니다.

- `start-pos-agent.cmd` — 이미 설치된 `EKODI POS Agent` 예약 작업을 즉시 시작하고 loopback 상태를 확인합니다. 설치 전에는 동작하지 않습니다.
- `stop-pos-agent.cmd` — 현재 실행 중인 Agent 예약 작업만 중지합니다. **다음 Windows 로그인 시 자동 시작 설정은 유지**됩니다.
- 처음 설치는 관리자 화면의 `setup-pos-agent.cmd` 원클릭 설치를 권장합니다. 고급 수동 설치에서는 `install-pos-agent.ps1`을 사용합니다.
- 실행/중지 파일에서 권한 거부가 나오면 파일을 우클릭해 **관리자 권한으로 실행**합니다.
- 완전 제거는 CMPMYI 관리화면의 `remove-pos-agent.cmd` 원클릭 삭제를 권장하며, 고급 수동 제거에는 `uninstall-pos-agent.ps1`을 사용합니다.

## Windows 예약 작업 오류 0x80041318

일부 POS PC에서 설치 중 `Register-ScheduledTask`가 `HRESULT 0x80041318` 또는 “작업 XML 형식이 잘못되었거나 범위를 벗어난 값” 오류를 낼 수 있습니다. Windows Task Scheduler의 실패 재시작 간격은 **최소 1분**이어야 하므로 Agent 설치기는 1분 간격을 사용합니다. 그래도 구형 환경이 재시작 설정을 거부하면 설치기가 재시작 옵션을 제외한 호환 설정으로 한 번 자동 재시도합니다.

이 오류가 난 기존 원클릭 설치 창은 닫고, 관리자 POS 통합화면에서 **원클릭 설치 (.cmd)** 를 다시 내려받아 실행하면 됩니다. 별도 제거 작업은 필요하지 않습니다.

## 설정 기준

`processNames`와 `windowTitleContains` 중 하나 이상이 있으면 상태 확인 대상으로 간주합니다. 브라우저 기반 주문 서비스가 하나의 Chrome 창에서 여러 탭으로만 열려 있으면 탭 단위 전환이 안정적이지 않습니다. 그런 서비스는 별도 Chrome 앱/바로가기 창으로 실행한 뒤 해당 창 제목이나 바로가기 경로를 매핑하는 방식이 더 안정적입니다.

`allowedStores`는 이 PC에서 사용할 EKODI 매장 slug만 넣습니다. 기본 예시는 자담치킨(`jadam`)·피자마루(`pizzamaru`)·요거트퍼플(`yogurt`) 3개 1호점 운영공간을 허용하며, 전용 POS라면 실제 사용하는 매장만 남겨 범위를 줄일 수 있습니다.

## 로컬 API

- `GET /v1/health` — 등록 대상의 configured/running/windowTitle 상태
- `POST /v1/focus` — `{"target":"vpos"}`처럼 미리 등록된 대상만 사용자 동작으로 전환
- `OPTIONS` — CORS / Private Network Access 사전 요청

에이전트는 모든 Windows 창 목록이나 임의 실행 명령을 외부에 제공하지 않습니다.

## 다음 단계

초기 단계는 **프로그램 상태 확인 + 한 번 터치 전환**입니다. 실제 주문 수집·접수·메뉴 변경은 이미 EKODI Store Admin의 공식 API/승인 Bridge 경계를 그대로 사용하며, 외부 플랫폼 권한이 없는 상태를 성공으로 표시하지 않습니다.
