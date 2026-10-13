# EKODI 자체 브라우저 연결기

EKODI Windows Device Agent용 독립 Chromium/CDP 브라우저 연결기의 1차 구현입니다. 외부 Desktop Commander 또는 외부 브라우저 구독 서비스가 필요하지 않습니다.

## 실행

요건: Node.js 22 이상, Chrome/Edge(Windows) 또는 Chromium(Linux). 공식 저장소에서 검증된 코드를 사용합니다.

```powershell
node tools/ekodi-device-agent/windows/ekodi-owned-browser-connector.mjs --canary
node tools/ekodi-device-agent/windows/ekodi-owned-browser-connector.mjs --site /singles
node tools/ekodi-device-agent/windows/ekodi-owned-browser-connector.mjs --pr 4392
node tools/ekodi-device-agent/windows/ekodi-owned-browser-connector.mjs --pr 4346
node --test test/ekodi-owned-browser-connector.test.mjs
```

## 작동 범위

- 전용 임시 Chromium 프로필·localhost 전용 CDP 소켓·백그라운드 headless 실행
- HTTPS 대상 및 하위 요청 출처 제한. GET/HEAD/OPTIONS 외 요청은 CDP에서 차단
- 사용자 브라우저, 열린 탭, 로그인 쿠키, 비밀번호 저장소, 마우스, 클립보드와 격리
- 작업 후 전용 프로세스 및 프로필 자동 정리. 결과는 페이지 제목, 안전한 URL, HTTP 코드 등 최소한의 JSON 증거
- GitHub 점검은 EKODI 소유 저장소의 숫자 PR 경로만 가능. EKODI 점검은 제한된 ekodi.kr 경로만 가능

## 제한 및 운영 연계

현재 연결기는 읽기 전용 1회성 모듈이며 GitHub 로그인, 병합, Actions 워크플로 실행 권한은 없습니다. AUTH_REQUIRED는 명시적인 권한 위임 또는 사용자의 인증 절차가 필요하다는 의미입니다. 승인 없이 브라우저 쿠키를 복사하거나 사용자 브라우저 프로필을 재사용하지 않습니다.

정식 운영 적용에는 기존 device-control.js 승인·작업 큐와 ekodi-device-agent.ps1의 안전한 명령 경로에 연결하고, 중앙 Agent heartbeat, 작업 임대, 결과 수신 및 실제 PC canary를 검증해야 합니다. PR 병합이나 CI 통과만으로 운영 PC 설치/실행이 완료된 것은 아닙니다.

GitHub 보호 병합 및 Supabase 운영 DB 반영은 브라우저 화면을 통한 우회가 아니라 EKODI 공식 오케스트레이터의 승인된 실행과 배포 기록으로 검증합니다.
