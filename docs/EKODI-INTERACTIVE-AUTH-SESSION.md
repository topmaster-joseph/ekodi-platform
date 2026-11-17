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


## 도매꾹 에코디비즈 전용 인증 (2026-11-04, 단계적 검증)

- 관리자 진입: `https://ekodi.kr/admin/ops/devices?externalAuth=domeggook-business`
- 공식 공급사 진입: `https://www.domeggook.com/main/` (EKODI 디바이스 에이전트의 등록 서비스 ID `domeggook-business`)
- 별도 TinyFish 구독이나 기존 Opera·Chrome 사용자 프로필, 세션 쿠키 복사는 사용하지 않는다.
- 최고관리자 명시 확인 + PC 앞 사람의 로컬 동의 후 신규 임시 Chromium 프로필에 로그인한다. 브라우저는 30분 기본, 최대 60분 후 자동 종료·삭제.
- 로그인 단계 판정은 해당 공식 호스트·허용 경로·화면의 **로그아웃 표시**·비밀번호 입력화면 부재를 모두 요구한다. 이 판정은 화면 상태에 한정하며, 구매용 Private API 권한·사업자 회원 등급·이머니 잔액 확인을 대신하지 않는다.
- 읽기 전용 점검에서는 메뉴별 존재 여부만 익명화하여 반환한다. 이메일·휴대전화·주소·계정 ID·잔액 숫자·자격증명·쿠키·인증번호는 수집하거나 서버에 전송하지 않는다.
- 이 기능은 상품 주문·결제·공급처 개인정보 전송을 **절대로** 수행하지 않는다. 실제 도매꾹 소액 시험주문은 공식 `setOrder` API와 기존 `BUYER_PII_RELEASE_ENABLED`, `SUPPLIER_FORWARD_ENABLED`, `DOMEGGOOK_PILOT_ORDER_IDS`, `DOMEGGOOK_PILOT_MAX_TOTAL_KRW` 승인 가드를 모두 통과한 후 별도 수행해야 한다.
- 공급사 사업자 자격은 공식 `setLogin` 반환의 회원등급 등을 공급사 규약으로 확인하며, 단순 브라우저 로그인 성공을 거래 승인으로 승격하지 않는다.
- 기존 `EKODI-BROWSER-WORKER-001`의 ekodi.kr 출처 제한·자동인증 금지 정책은 변경하지 않는다.

## 코레일 KTX 전용 인증 (2026-11-18 · Issue #9876)

- 사용자 요청: 2026-12-10 목포 07:03 KTX 406 13호차 5D 옆 **5C 1매** 추가 / 용산 16:38 KTX 431 목포행 **나란한 2매**. 이 요청은 **예매·결제·발권 완료를 뜻하지 않는다**.
- 공식 로그인: `https://www.korail.com/ticket/login`. 공식 안내: `https://www.korail.com/ticket/reserve/guide/faq`.
- EKODI 관리자 진입: `https://ekodi.kr/admin/ops/devices?externalAuth=korail-ticket` (공식 릴리스 및 Windows Agent 2.6.7+ 배포 후에만 사용 가능).
- 등록 PC의 `interactiveAuthSession=true` 및 `korailNativeAuth=true`, 온라인 heartbeat, 최고관리자 승인, PC 앞 사람의 현장 동의가 필수다. 전용 임시 Chromium 창에서 **사용자가 직접** 코레일 ID·비밀번호·OTP를 입력하며, EKODI는 읽거나 전달하지 않는다.
- 서비스 출처 `https://www.korail.com`만 로그인 판정 대상이며, `/ticket/` 경로에 도달했더라도 **보이는 로그아웃 표식과 비밀번호 입력창 부재**가 동시에 확인되어야 한다. 이는 로그인 상태의 보수적 신호이지 예매권한이나 잔여좌석을 증명하지 않는다.
- 코레일에서는 **로그인 상태만 점검**한다. 메뉴 텍스트, 승객정보, 예약내역, 운임, 결제수단, 좌석 또는 발권정보를 로컬 판독·업로드하지 않는다. AI 입력과 서버 영수증에도 포함하지 않는다.
- 좌석 조회, 자동 선택, 주문·결제, 승차권 다운로드·조회는 이 기능의 권한 밖이다. 별도 제공자 약관 검토·권한 설계와 명시적 Human Gate를 거치기 전에는 코레일 공식 화면에서 **본인이 직접** 수행한다. CAPTCHA 우회·요청 과부하·차단 회피를 금지한다.
- 로그인 상태 점검 후 **세션 즉시 종료·삭제**, 미완료 시 30분 자동 만료로 쿠키 포함 임시 프로필 삭제를 확인한다. 기존 인증 워커, 타서비스, 개인 Opera/Chrome/Edge 프로필은 변경하지 않는다.
- 공식 병합·배포 전 테스트: `node --test test/interactive-auth-session.test.mjs test/ekodi-browser-independence.test.mjs`, `node scripts/validate-interactive-auth-session.mjs`, Agent 모의 E2E, 중앙 오케스트레이터·보안·스테이징·실운영 검증.
- 코드 브랜치나 PR 생성은 운영 적용을 의미하지 않는다. Windows Agent 업그레이드 후 실제 코레일 로그인, 종료 후 임시 프로필 삭제, 영수증 분리 확인 없이는 기능을 완료로 보고하지 않는다.
