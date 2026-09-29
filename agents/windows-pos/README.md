# EKODI Windows POS Agent

EKODI Store Console이 **현재 POS PC에서 실행 중인 Windows 프로그램의 상태를 확인하고, 사용자가 직접 `바로 전환`을 누른 경우에만 해당 창을 앞으로 가져오도록** 하는 로컬 에이전트입니다.

## 안전 원칙

- 서버는 `127.0.0.1` 또는 `localhost`에만 바인딩합니다. 외부 네트워크에는 열지 않습니다.
- 브라우저 Origin은 기본적으로 `https://ekodi.kr`만 허용합니다.
- 임의 프로그램 경로나 명령어를 웹 요청으로 받지 않습니다. 전환 가능한 대상은 로컬 설정 파일에 미리 등록된 ID만 허용합니다.
- 새 주문이나 알림만으로 창을 자동 전환하지 않습니다. `POST /v1/focus`는 Store Console에서 사용자가 직접 버튼을 누른 경우에만 호출됩니다.
- 프로그램 자동 실행은 대상별 `allowLaunch: true`를 명시한 경우에만 허용됩니다. 기본값은 꺼짐입니다.

## 설치

1. 이 폴더의 `pos-agent.config.example.json`을 같은 폴더의 `pos-agent.config.json`으로 복사합니다.
2. 실제 POS PC에서 각 프로그램의 **프로세스 이름(확장자 제외)** 또는 **창 제목 일부**를 확인해 대상별로 입력합니다.
3. 필요할 때만 `launchPath`에 설치 프로그램 또는 Windows 바로가기(`.lnk`)의 고정 경로를 넣고 `allowLaunch`를 `true`로 바꿉니다.
4. PowerShell에서 다음을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\EKODI-POS-Agent.ps1
```

Windows가 `Access denied`로 로컬 리스너 시작을 막는 경우, 관리자 PowerShell에서 **한 번만** 아래와 같이 정확한 loopback URL을 현재 사용자에게 예약한 뒤 에이전트는 일반 사용자로 실행합니다.

```powershell
netsh http add urlacl url=http://127.0.0.1:17831/ user="$env:USERDOMAIN\$env:USERNAME"
```

브라우저가 처음 연결할 때 로컬 네트워크 접근 권한을 묻는 경우 `ekodi.kr`의 POS 통합화면 사용을 위해 허용합니다.

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
