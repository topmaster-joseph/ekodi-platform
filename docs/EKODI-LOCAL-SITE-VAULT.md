# EKODI 범용 로그인 사이트 보관함 — 로컬 브라우저 MVP

2026-11-18 · 중앙 작업 [#9905](https://github.com/topmaster-joseph/ekodi-platform/issues/9905) · 정책 `EKODI-LOCAL-SITE-VAULT-001` · 초기 단계: **운영 비활성 / 안전성 검토 중**

## 기존 두 보관함과의 관계

- **My EKODI 개인 자격증명 보관함**: `PERSONAL-CREDENTIAL-VAULT-001`, `/my/security/vault`. 개인 계정 목록·복구 코드·API키 등의 서버 관리 설계. 운영은 별도 보안 검증 전까지 비활성. 원시 암호를 Agent, AI 또는 MCP에 전달하지 않는다.
- **EKODI 로컬 사이트 보관함**: `ekodi-site-vault.ps1`. 이 PC의 Windows 사용자와 등록 사이트의 정확한 HTTPS origin별로 **브라우저 프로필**을 별도 저장. DPAPI CurrentUser로 프로필의 zip 데이터를 봉인한다. 서버는 로그인 쿠키/비밀번호/브라우저 저장소를 보유하지 않는다.
- **EKODI Interactive Auth / Attended Operator Browser**: 기존 FactChat·도매꾹·코레일 인증 세션 및 일회성 관리 레시피는 기존 격리·삭제 규칙을 그대로 따른다. **절대 기존 세션을 이 보관함으로 암묵적으로 이전하지 않는다.**

## 사용 흐름 (Windows에서 본인이 직접 실행, 운영 승인·설치 후)

1. 에코디로 관리할 사이트의 **정확한 HTTPS 주소**를 확인한다. 예: `https://www.korail.com/ticket/login`. 사이트가 요구하는 약관·추가인증·패스키·CAPTCHA를 그대로 준수한다.
2. Windows 로그인 중 본인이 `powershell -NoProfile -File ekodi-site-vault.ps1 -Action register -Site "https://www.korail.com/ticket/login"`을 실행한다. 자동/원격 관리자는 실행하지 못하며 Windows PC의 현장 동의를 확인한다.
3. 열린 **에코디 전용 분리 브라우저**에서 사용자가 직접 로그인한다. 비밀번호 입력은 원격 AI, 관리자 페이지, 에코디 서버가 아니라 사이트의 로그인 페이지에서만 이뤄진다. 기본적으로 브라우저 비밀번호 저장은 비활성이다.
4. 로그인 유지뿐 아니라 브라우저 자체의 비밀번호 저장까지 원할 경우에만 등록 시 `-RememberPasswords`를 명시하고, PC의 추가 동의와 브라우저의 저장 확인을 각각 승인한다. **사이트가 허용하는 경우에 한함.** 비밀번호와 패스키는 EKODI 코드에서 읽거나 자동 입력하지 않는다.
5. 브라우저 창을 닫으면 해당 사이트 프로필이 **로컬 Windows 계정 DPAPI로 봉인**되고 임시 폴더는 삭제된다. 같은 Windows 계정에서 `-Action open -Site ...`으로 다시 열어 복원할 수 있다. 서버에서 사용할 수 있는 암호는 없다.
6. `-Action list`는 현 Windows 사용자의 사이트 origin만 표시하고, `-Action delete -Site ...`는 현장 재확인 후 해당 파일을 삭제한다.
7. 쿠키 만료·MFA·패스키·사이트별 정책에 따라 다시 로그인해야 할 수 있다. **모든 사이트에서 자동 로그인이나 비밀번호 저장을 보장할 수 없다.**

## 구현된 보안 경계

- 공개 HTTPS DNS host만 수용. IP 직접 접속·localhost·내부망·단일 레이블·기타 비공개 TLD·URL 사용자:비밀번호·쿼리/fragment·일반 비표준 포트는 거부한다. 정확한 origin의 SHA256 식별자로 사이트별 서로 다른 봉인파일을 생성한다.
- 로그인 프로필은 사이트마다 독립적이다. 기존 Chrome·Edge·Opera 프로필, 저장된 비밀번호 또는 세션을 가져오지 않는다. 확장·브라우저 동기화·원격 디버깅·AI 입력 자동 주입은 비활성이다.
- 암호화: Windows DPAPI **CurrentUser**로 프로필 archive + start URL + 계정 비밀번호 저장 동의 여부를 봉인. 사이트별 entropy로 다른 도메인의 봉인을 복원할 수 없게 한다.
- 브라우저가 실행 중일 때는 임시 프로필이 디스크에 복원되어 있으므로 **Windows 계정 잠금·BitLocker 또는 동등한 전체 디스크 암호화·악성코드 방지**가 중요하다. 동일한 Windows 사용자 권한의 악성코드 침입이나 관리자·커널 침해까지 막는다고 주장하지 않는다.
- 사이트별 로컬 파일 잠금으로 중복 실행·동시 봉인을 막는다. 브라우저 종료·최대 8시간 후 프로필을 봉인하고 임시 작업 폴더를 정리한다. 봉인 저장 실패 시 마지막 정상 암호문은 보호하고 암호화되지 않은 활성 폴더는 삭제한다.
- 이전 실행이 갑자기 종료된 후 남은 프로필은 다음 로컬 실행 시 안전한 조건(오래됨·브라우저 프로세스 없음)으로만 제거한다. **실시간 watchdog, 전원 끊김/강제 종료 직후 삭제, 실제 PC 인증/파일 ACL E2E는 미검증**.
- 동기화·공유·비밀번호 내보내기·AI가 원격으로 금고 열기·무인 실행·주문/결제·대량 로그인 자동화는 이 MVP에 없다.

## 별도 보안 검증 및 운영 활성화 조건

1. `node --test test/browser-site-vault.test.mjs test/device-control-contract.test.mjs`
2. Windows Runner에서 `tools/ekodi-device-agent/windows/tests/site-vault/verify-site-vault.ps1`의 **synthetic-only** DPAPI 암호화→복원→도메인 간 분리→변조거부 검증.
3. 초안 PR, 에코디 오케스트레이터의 권한 확대·암호 보관 경계 심사, CI, protected merge, guarded staged release. 기존 `PERSONAL-CREDENTIAL-VAULT-001`과 충돌 금지.
4. 실제 사용자 PC Windows 로그인 보안, ACL, 크롬/엣지 저장 암호·세션, 비정상 종료·정전·재시작 시 정리, 저장소·동기화 차단, 실제 사이트 2종 이상을 재검증.
5. 사용자가 선택하는 사이트별 현장 동의와 삭제·회수·비밀번호 변경 안내를 제공하는 사용자용 UI/패키징·서명·업데이트 검증이 끝난 뒤에만 운영 기능을 켠다.
6. 최종 운영 준비는 **실제 기기·실제 사이트에서** 등록→로그인→창 종료→DPAPI 봉인→복원→재로그인 필요여부 판정→삭제까지 순서대로 증거가 있어야 한다. PR·CI만으로 완료/보안을 단정하지 않는다.

## 금지

원격 Agent가 `EKODI-LOCAL-SITE-VAULT-001` 보관함 파일·암호화 키·쿠키·브라우저 데이터를 읽거나 업로드하지 않는다. 인증 세션을 사용자 동의 없이 원격으로 열지 않는다. 결제/비가역 변경/제3자 데이터 전송은 별도 권한과 Human Gate가 필요하다.
