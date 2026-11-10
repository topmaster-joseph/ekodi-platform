# EKODI AI Family — 통합 합성 실행 검증 (Phase 7)

**작업:** #9176 (원본 #8745 / #8746). 최신 main 기준 재제출. 상위 이슈 #7796. 관련 소스 PR #8633(실행기), #8728(서명·동의·nonce), #8744(Control API 상태 전송).

## 목적

독립적으로 테스트된 세 모듈 — `createWindowsNativeFamilySidecar`, `createNativeFamilyConsentBroker`, 영속 nonce 계약 — 을 **실제로 하나의 테스트 경로로 결합**한다. 사용자가 승인한 것처럼 속여서 실제 OS 프로세스를 실행하지 않고, 별도의 **모의 Windows 세션**에서만 검사한다.

`test/ai-family-native-integrated-synthetic.test.mjs`는 다음 경로를 연결한다.

1. 유효기간이 있는 하이브리드 `hyb_...` 작업번호·기기번호·요청 해시, 코드 읽기 전용 명령만 준비.
2. 모의 WindowsPrincipal 세션에서 관리자 권한이 **없는**지 확인.
3. 독립 사용자 동의 요청·확인 후, 시험용 Ed25519 개인키로 작업번호·요청 해시·기기·공급자·실행 바이너리 해시를 서명.
4. 시험용 영속 DB에서 `nonce`와 `job_id` 동시 고유 제약을 원자적으로 소비.
5. 정확한 Node·CLI 파일 SHA256, 구독 로그인 방식, 제한된 환경변수, 0원 정책과 읽기전용 CLI 명령을 점검.
6. 실행 전·후 lease 갱신 및 fake process 종료를 통해 bounded receipt 발급.
7. 별도 실행기 두 개가 동일 작업을 동시에 받으면 **한 번만 실행**하도록 거부.
8. OS 권한 거부, 사용자 동의 거부, API 키 인증, 서명 변경, 바이너리 변조, lease 갱신 실패, 사용자 취소 상황을 각각 검사.

## 실행 안전 조건

- 모의 `spawn`, 모의 `readFile`, 모의 Windows 토큰·OAuth 반환값 및 시험용 DB만 사용한다.
- 구독 계정 로그인·Windows 실기기 원격제어·서버 계정 변경·유료 API·브라우저 자동화·서비스 설치·운영 배포를 실행하지 않는다.
- 모든 성공은 **synthetic contract E2E**에 한정한다. 이 테스트를 `SYSTEM_VERIFIED` 또는 실기기 서비스 성공으로 부르지 않는다.
- `AI_ROUTE_FAMILY_AUTO_DISPATCH` 기본 false, 비용 예산 0원 및 비승격 사용자 세션 의무는 그대로 유지한다.

## 남은 운영 게이트

실제 Windows 사용자 권한에서 신뢰 가능한 사용자 동의 UI·보호된 서명키 발급·OS 증명·독립 큐 토큰·실제 지속형 nonce 저장소·OAuth 구독 로그인·실제 Codex/Claude Code 바이너리 검증·명령 수신·취소·heartbeat·결과 서명과 관리자 화면 E2E 증거가 필요하다. 현재 Desktop Commander 월간 사용량 제한으로 실기기 명령 실증이 불가능하다.

작업 PR은 EKODI의 `orch_recovery`를 통한 테스트/승인/병합 경로에서만 통합한다. 합성 테스트 성공만으로 운영 자동 실행을 켜서는 안 된다.
