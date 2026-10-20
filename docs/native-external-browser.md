# EKODI 자체 브라우저 실행기 — 외부 서비스 연결 파일럿

## 목적
TinyFish 등 외부 유료 브라우저 서비스를 기본값으로 사용하지 않는다. 기존 `ekodi-background-browser-worker`는 오직 `ekodi.kr`의 **비로그인·격리 웹 검증** 전용으로 유지한다. 별도 `ekodi-owned-youtube-browser`는 사용자 직접 승인한 외부 채널 연결만 다룬다.

## 적용 범위
- 공급자: YouTube Studio (`https://studio.youtube.com/`)
- 조직: 청계면상인회, `https://www.youtube.com/@cgma4989`
- 고정 채널 ID: `UC001JT9opxVBt9z_h-tsx8A`
- 기존 에코디교회 채널과 세션/저장소 공유 금지
- 읽기 전용 채널 공개 접근성 검사와 관리 채널 ID 확인까지만 수행
- **라이브 시작·종료·영상 수정·삭제·방송 예약은 이 파일럿에서 지원하지 않음**

## 로컬 PC 실행
Windows에 Node 24와 Chrome이 설치된 경우 해당 PC의 로컬 터미널에서:

```powershell
git clone https://github.com/topmaster-joseph/ekodi-platform.git
cd ekodi-platform
npm install --no-save --package-lock=false playwright@1.64.0
node scripts/ekodi-owned-youtube-browser.mjs public-check
node scripts/ekodi-owned-youtube-browser.mjs login-setup --approve-interactive-setup
node scripts/ekodi-owned-youtube-browser.mjs session-verify
```

`login-setup`은 해당 **로컬 PC에서 사용자가 직접 실행**할 때만 Chrome 전용 창을 연다. Google 계정으로 직접 로그인하고 청계면상인회 채널을 선택한 후 터미널에서 Enter를 누른다. 실제 YouTube Studio의 주소에 **정확한 채널 ID**가 나타나는 경우에만 프로필 사용 동의를 로컬에 남긴다. Google 계정 비밀번호, 인증코드, 쿠키, 토큰은 EKODI 서버/GitHub로 전송하지 않는다.

이미 TinyFish에 저장한 로그인은 이 프로필에 자동으로 복사되지 않으며, 위 과정에서 1회 다시 로그인해야 한다. 사용자의 기존 Chrome 기본 프로필을 빌려 쓰지 않는다.

## 로컬 저장·권한
`%LOCALAPPDATA%\EKODI\BrowserOperator\youtube-cgma4989` (Windows) 또는 사용자 로컬 전용 경로를 사용한다. 삭제/재연결은 별도 프로필 디렉터리를 로컬 운영자가 관리한다. 실행 로그에는 채널 ID, 결과코드, 공개 URL의 경로만 남긴다. 안전을 위해 화면 전체 DOM, 개인식별정보, 비밀번호, HTTP 요청/응답 본문은 클라우드로 수집하지 않는다.

## 검증·진행 경계
`node --test test/ekodi-owned-youtube-browser.test.mjs`로 채널 ID, 허용 모드, 가짜 URL 거부, 수동 로그인 요건, 세션 미인가 차단을 확인한다.

현재 단계는 **코드·계약 검증 파일럿**이다. EKODI 관리자 명령창에서 이 모듈로 작업을 직접 전달하는 API, 작업큐, 로컬 에이전트 자동 실행, 운영 배포 및 유튜브 실계정 로그인 확인은 아직 별도 단계이며, 완료로 보고하면 안 된다.

추후 연동은 EKODI Orchestrator가 인증된 사이트 운영권을 확인하고 작업별 권한을 발행해야 한다. 잠금/만료/감사/단일 프로필 중복 실행 차단을 구현한 뒤 단계적으로 연결한다. 직접 송출·게시 등 외부 영구 변경은 별도 명시적 사용자 승인과 완료 증거가 필수다.
