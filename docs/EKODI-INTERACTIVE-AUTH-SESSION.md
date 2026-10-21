# EKODI 외부 서비스 인증 세션 (EKODI-INTERACTIVE-AUTH-001)

기준 과제: [#5533](https://github.com/topmaster-joseph/ekodi-platform/issues/5533) · 정책: `config/interactive-auth-session-policy.json`

## 무엇을 하는가

최고관리자가 EKODI 관리자 화면에서 **등록된 PC 한 대**를 골라 FactChat(국립목포대학교 기관계정) 공식 로그인 창을 엽니다. 창은 사용자 Opera/Chrome/Edge가 아니라 **EKODI가 그때만 만든 임시 Chromium 프로필**로 열리고, 로그인은 **PC 앞의 본인이 FactChat 공식 페이지에 직접** 합니다. 이후 EKODI는 읽기 전용 점검만 하고, 종료·만료 시 창과 임시 프로필(쿠키 포함)을 삭제합니다.

이 기능은 `EKODI-BROWSER-WORKER-001`(백그라운드 워커)을 완화하지 않습니다. 백그라운드 워커는 여전히 ekodi.kr 전용이며 인증이 필요하면 `AUTH_REQUIRED`로 기록하고 닫습니다. 본 기능은 헌법 `AUTOMATIC-EXECUTION-LIFECYCLE-001`이 허용한 전경 예외 `oauth-or-provider-consent`에만 해당하며 자동 실행·자동 배정이 될 수 없습니다.

## 시작 주소

`https://ekodi.kr/admin/devices-agent/devices?externalAuth=factchat-mokpo`

로그인 → 해당 PC 카드 → **외부 서비스 인증·검증 · FactChat** 패널.

## 사용 절차 (사람이 하는 일)

1. 최고관리자 계정으로 위 주소에 접속합니다. PC가 `온라인`이고 Agent가 기능을 지원해야 합니다(아니면 먼저 `Agent 업데이트`).
2. **로그인 창 열기** → 확인.
3. 해당 PC 화면에 뜨는 **EKODI 외부 서비스 로그인 동의** 창에서 `예`(2분 내 응답, 무응답·거부 시 아무 창도 열리지 않음).
4. 열린 창 주소가 `mokpo.factchat.bot`인지 확인하고 **본인이 직접** 기관 계정으로 로그인합니다. 비밀번호·인증번호를 EKODI, 채팅, AI에 보내지 않습니다.
5. 관리자 화면 상태가 `로그인 확인됨`이 되면 **로그인 후 읽기 전용 점검**.
6. 끝나면 **세션 즉시 종료·삭제** (또는 창을 닫거나 30분 만료 시 자동 삭제).

## 보안 경계

| 항목 | 동작 |
|---|---|
| 권한 | 시작·점검은 `super_admin` + 명시 확인, 종료는 모든 관리자 |
| 현장 동의 | PC에서 사람이 `예`를 눌러야만 창이 열림 |
| 프로필 | `ProgramData\EKODI\DeviceAgent\InteractiveAuth\Session-<uuid>` 신규 생성, 비밀번호 저장·자동완성 끔, 종료 시 삭제 확인 |
| 브라우저 | EKODI Chromium → Chrome → Edge (임시 프로필), Opera 실행 금지 |
| 수집 금지 | 비밀번호·OTP·쿠키·스토리지·화면 캡처·클립보드·입력 주입 없음 (영수증 불변식으로 서버가 검증) |
| 상태 보고 | 호스트 이름과 단계만 (전체 URL·제목·본문 미전송) |
| 점검 | 공식 출처 페이지에서 고정된 읽기 전용 표현식만 실행: 메뉴 표시 여부(로컬 판정), 메뉴 수, 크레딧·사용량 문구(이메일·전화 마스킹) |
| CDP | `127.0.0.1` 바인딩, 세션 중에만 존재 |
| 만료 | 기본 30분·최대 60분, Agent 루프가 강제 |
| 자동 배정 | 금지 (`INTERACTIVE_AUTH_JOB_FORBIDDEN`) |

## 판정 원칙

- 메뉴가 보이는 것은 **실행 검증이 아닙니다**. 결과는 `menu_visible_execution_unverified`로만 표시합니다.
- 회의록 업로드, HWP 편집·저장, PPT 생성·내보내기, Super Agent, Deep Research, *-in-Data 질의는 크레딧 정책 확인 후 **별도 승인**으로만 실행합니다.

## 검증

- `npm run validate:interactive-auth` — 정책·코드·워커 불변 하드 게이트
- `node --test test/interactive-auth-session.test.mjs` — 정책 단위 + 실제 Control API 핸들러 통합(SQLite D1 어댑터)
- `tools/ekodi-device-agent/windows/tests/interactive-auth-e2e/` — 실제 Agent 함수 + 실제 Chromium E2E (모의 FactChat). 증거: `evidence/runtime/interactive-auth/2026-10-21-agent-e2e.json`

## 롤백

먼저 열린 세션을 **세션 즉시 종료·삭제**로 닫은 뒤 PR revert → guarded release → 각 PC `agent.self_update`. 이전 Agent는 세션 만료를 관리하지 않으므로 종료를 먼저 확인합니다.
