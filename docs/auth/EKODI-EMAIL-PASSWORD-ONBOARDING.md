# EKODI 이메일·비밀번호 간편 가입 / 단일 EKODI ID 도입 계약

상태: **운영 기능 신규 활성화 전 단계 — 기술·운영 승인과 실증 필요** (2026-10-29).

## 원하는 이용 흐름

사용자는 처음 방문한 EKODI 사이트에서 `이메일·비밀번호로 가입` 또는 `Google/네이버/카카오로 계속하기`를 선택한다. 모든 방법의 결과는 같은 **EKODI Person / 고유 EKODI ID**이며 서비스별 추가 가입이 아니다. 무료회원 자격은 공통, 교회·선교회·비즈·단체·관리자·결제 권한은 EKODI 서버의 별도 검증 대상이다.

- **이메일 가입**: 이메일+비밀번호만 입력 → 안내가 포함된 인증메일 발송 → 이메일 주소의 소유권 확인 → 본인 EKODI ID 생성 및 공통 FREE 부여 → 최초 원래 페이지로 돌아가기. 소셜계정은 요구하지 않는다.
- **이메일 로그인**: 이메일+비밀번호 확인 → 기존 EKODI Person을 조회 → `/auth/`의 현행 안전한 일회용 handoff 사용 → 원래 사이트/페이지로 이동.
- **비밀번호 찾기**: 가입 여부를 노출하지 않는 동일한 안내 → 기간 제한 일회용 이메일 링크 → 새로운 비밀번호 설정. 재설정 흐름에서 정상 사용자 화면으로 자동 handoff 되지 않도록, 복구 모드가 먼저 처리한다.
- **나중에 소셜 연결**: 기존 EKODI 세션과 새 외부 공급자 본인확인을 모두 통과한 뒤 같은 Person에 연결. 이메일이 같다는 이유만으로 기존 구글 계정을 자동 병합하거나 관리자 권한을 주지 않는다.

## 기존 아키텍처와 실제 구현에서 필요한 추가 작업

1. 브라우저 클라이언트는 기존 **Supabase Auth의 표준** `signUp({email,password})`, `signInWithPassword({email,password})`, `resetPasswordForEmail(email)`, `updateUser({password})`를 이용한다. 비밀번호를 EKODI Worker나 D1, 자체 DB, 감사 로그, 챗봇 서버로 보내거나 저장하지 않는다.
2. 이메일 소유권 확인 전에는 회원 등록 완료 또는 서비스 세션 발급으로 인정하지 않는다. Supabase 프로젝트에서 **Confirm Email 활성** 여부를 운영자 권한으로 검증해야 하며, 계정이 자동 확정되도록 설정된 경우 출시 차단.
3. 현재 `supabase/functions/identity-api/index.ts`의 `/session/handoff`는 인증 사용자 조회 후 `login_identities`/Person 유무를 읽고, 새 이메일 사용자를 위한 Person 자동 생성은 **아직 구현하지 않는다**. 코드 착수 시 검증된 이메일 Auth 사용자만 서버에서 `ensure_person_identity`를 안전하게 호출하고 `p_provider='email'`, stable auth-user subject로 기록하되 기존 사람·기존 Google identity를 바꾸지 않는다. Person과 회원권한 생성 검증 실패는 반드시 fail closed. 먼저 테스트 DB에서 충돌/동시성/계정탈취를 재현한다.
4. 신규 이메일 인증은 다른 소셜 로그인처럼 한 개의 `login_identities`에 기록되고, `ekodi_account_for_auth_user` 및 `/session/handoff`를 통해 같은 EKODI ID를 제공해야 한다. `email_verified`는 서버가 확인된 신원에만 true로 기록한다. 사전등록 이메일 권한은 인증·Person 연결 전 적용하지 않는다.
5. 원래 페이지 `return_to`는 `auth-site/client-auth.js`와 기존 중앙 whitelist·URL 복귀 규칙을 그대로 이용한다. 가입 확인·비밀번호 재설정 링크 역시 정확한 `https://ekodi.kr/auth/` 경로와 검증된 리디렉션만 사용한다.
6. **발송 준비**: Supabase 기본 이메일 발송 서비스는 운영 대량발송을 보장하지 않는다. 확인/복구 메일을 처리할 정식 SMTP·SPF/DKIM/DMARC, 발송량·실패율, 개인정보 처리, 비용 동의를 검증해야 한다. 발송 자체를 무료로 보장하지 않는다.
7. 비밀번호 길이/유출 비밀번호 방지, 로그인 속도제한과 비정상 가입 방어, CSRF/state/nonce, 암호 재설정 한 번만 허용, 쿠키/세션 만료, 이메일 존재 여부 비노출, 접속 로그에 비밀번호 미노출을 검증한다.
8. **운영 스위치**는 이메일 로그인 UI·신규 가입·비밀번호 복구를 관련 서버 기능/메일 설정 준비가 증명될 때까지 닫아 둔다. 테스트는 별도 비운영 환경에서 수행하고 프로덕션 사용자·DB에 테스트 가입을 만들지 않는다.

## 소셜 공급자 현재 운영 스위치와 독립

2026-10-29 생산 DB `identity_providers` 읽기 전용 조회 결과 Google `enabled=true`, Kakao `enabled=true`, Naver `enabled=false`. 이것은 **DB 스위치의 상태**이고, Kakao 키 설치나 성공 로그인까지 입증하지는 않는다. 이메일·비밀번호 가입은 이 소셜 공급자 스위치와 독립적으로 관리한다. 유튜브·인스타그램 외부 채널 원장 `ekodi_social_account_links`도 사용하지 않는다.

## 단계별 수용 기준

1. 일반 사용자는 이메일·비밀번호로 가입·확인·로그인할 수 있고 동일 EKODI ID가 서비스 간 유지됨을 운영 승인된 비실명 테스트에서 입증
2. 확인되지 않은 이메일·위조/만료 복구 링크·타인 계정 연결·동일 이메일 자동병합·일반 회원의 관리자 권한 상승을 모두 차단
3. 잊어버린 비밀번호로 다시 설정 가능, 기존 Google 사용자와 그 권한·활동 데이터가 변경되지 않음
4. EKODI Orchestrator 보호 CI → 명시적 운영 승인 → 단계적 배포 → 실제 인증/원위치 복귀 브라우저 E2E 이후에만 실제 이용 가능으로 표시

참고: `docs/AUTH-CENTER.md`, `docs/auth/FEDERATED-LOGIN-NAVER-KAKAO.md`, `supabase/functions/identity-api/index.ts`, `supabase/migrations/20260815020000_person_identity_workspaces.sql`. 비밀번호 원문은 코드/문서/로그에 기록하지 않는다.
