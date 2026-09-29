# EKODI Windows POS Agent

EKODI Store Console이 **현재 POS PC에서 실행 중인 Windows 프로그램의 상태를 확인하고, 사용자가 직접 `바로 전환`을 누른 경우에만 해당 창을 앞으로 가져오도록** 하는 로컬 에이전트입니다.

## 안전 원칙

- 서버는 `127.0.0.1` 또는 `localhost`에만 바인딩합니다. 외부 네트워크에는 열지 않습니다.
- 브라우저 Origin은 기본적으로 `https://ekodi.kr`만 허용합니다.
- 임의 프로그램 경로나 명령어를 웹 요청으로 받지 않습니다. 전환 가능한 대상은 로컬 설정 파일에 미리 등록된 ID만 허용합니다.
- 새 주문이나 알림만으로 창을 자동 전환하지 않습니다. `POST /v1/focus`는 Store Console에서 사용자가 직접 버튼을 누른 경우에만 호출됩니다.
- 프로그램 자동 실행은 대상별 `allowLaunch: true`를 명시한 경우에만 허용됩니다. 기본값은 꺼짐입니다.

## 설치

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

## 실행 · 중지 파일

관리자 화면의 **POS 통합화면**에서 실행/중지 안내와 파일 링크를 제공합니다. 파일을 내려받아 실행할 수 있으며, 브라우저가 Windows 프로그램을 직접 실행하거나 종료하지는 않습니다.

- `start-pos-agent.cmd` — 이미 설치된 `EKODI POS Agent` 예약 작업을 즉시 시작하고 loopback 상태를 확인합니다. 설치 전에는 동작하지 않습니다.
- `stop-pos-agent.cmd` — 현재 실행 중인 Agent 예약 작업만 중지합니다. **다음 Windows 로그인 시 자동 시작 설정은 유지**됩니다.
- 처음 설치할 때는 반드시 `install-pos-agent.ps1`을 관리자 PowerShell에서 한 번 실행해야 합니다.
- 실행/중지 파일에서 권한 거부가 나오면 파일을 우클릭해 **관리자 권한으로 실행**합니다.
- 완전 제거는 `uninstall-pos-agent.ps1`을 사용합니다.

## 설정 기준

`processNames`와 `windowTitleContains` 중 하나 이상이 있으면 상태 확인 대상으로 간주합니다. 브라우저 기반 주문 서비스가 하나의 Chrome 창에서 여러 탭으로만 열려 있으면 탭 단위 전환이 안정적이지 않습니다. 그런 서비스는 별도 Chrome 앱/바로가기 창으로 실행한 뒤 해당 창 제목이나 바로가기 경로를 매핑하는 방식이 더 안정적입니다.

`allowedStores`는 이 PC에서 사용할 EKODI 매장 slug만 넣습니다. 같은 POS PC가 자담치킨과 피자마루를 함께 운영한다면 예시처럼 두 slug를 둘 수 있습니다.

## 로컬 API

- `GET /v1/health` — 등록 대상의 configured/running/windowTitle 상태
- `POST /v1/focus` — `{"target":"vpos"}`처럼 미리 등록된 대상만 사용자 동작으로 전환
- `OPTIONS` — CORS / Private Network Access 사전 요청

에이전트는 모든 Windows 창 목록이나 임의 실행 명령을 외부에 제공하지 않습니다.

## 다음 단계

초기 단계는 **프로그램 상태 확인 + 한 번 터치 전환**입니다. 실제 주문 수집·접수·메뉴 변경은 이미 EKODI Store Admin의 공식 API/승인 Bridge 경계를 그대로 사용하며, 외부 플랫폼 권한이 없는 상태를 성공으로 표시하지 않습니다.
