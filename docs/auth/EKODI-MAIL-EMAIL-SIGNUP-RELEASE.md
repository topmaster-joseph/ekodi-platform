# EMAIL-ID-001 · EKODI Mail 이메일 회원가입 출시 게이트

상태: **소스 구현 / 운영 비활성**. EKODI Orchestrator는 아래 증거 없이 환경변수를 열거나 회원가입 성공을 선언하지 않는다.

## 역할 분리

- 사용자 로그인: `https://ekodi.kr/auth/`의 이메일·비밀번호 선택, 또는 기존 Google/네이버/카카오 본인확인 선택
- 비밀번호 보관·검증: **Supabase Auth** 전용. EKODI의 D1·메일함·Worker·브라우저 로컬 캐시에는 비밀번호를 보관하지 않음
- 본인확인 메일: **EKODI Mail 이름의 인증 발신자**, Supabase Auth의 확인·복구 SMTP 경로. `/mail`의 일반 메일함/포워딩은 수신 서비스이며 SMTP 서버가 아님. 기존 Gmail API 메일 발송 연결 역시 GoTrue SMTP로 자동 전용되지 않음.
- 내부 회원 원장: `people` + `ekodi_id`; `login_identities`에는 확인된 이메일 제공자 `provider=email`, 안정적인 `provider_subject=auth.users.id` 기록
- 1인 여러 로그인 수단: 현재 EKODI 신원에 로그인한 상태에서 외부 제공자 본인확인 후 명시적으로 연결. 이메일 문자열 일치만으로 자동 통합하지 않음

## 발신 설정 (공식 인증 전용)

Supabase Dashboard → Authentication → SMTP Settings에서 **Custom SMTP**를 구성한다. 발신 이름은 `EKODI 인증`으로 정한다. 발신 주소는 EKODI 소유 도메인의 인증 전용 주소(예: `no-reply@ekodi.kr`)를 **실제로 검증·승인한 뒤** 선택한다. SMTP 호스트/포트/사용자명/암호는 해당 인증 서버의 비밀값 설정에만 저장한다. 도메인의 SPF/DKIM/DMARC, 반송/실패 처리, TLS 및 발송량·비용 조건 확인이 필수다.

Supabase 기본 메일발송은 운영 서비스용이 아니다. 일반 EKODI Mail 수신 포워딩이나 연결된 외부 Gmail은 인증메일 SMTP 발신자로 자동 사용할 수 없다. 유료 서비스 등록·메시지 발송량 비용은 별도 운영 승인 대상이다.

## Supabase Auth 필수 설정

1. 이메일/비밀번호 제공자 허용, **Confirm Email ON**, 임의 이메일에 대해 확인 없이 세션이 생기지 않는지 비운영에서 실증
2. **Redirect URL allowlist**에 실제 필요한 `https://ekodi.kr/auth/` 및 허용된 `site/return_to` 패턴만 등록. 별도 하위도메인 사용 금지
3. 확인메일 Template: 인증용 6자리 OTP `{{ .Token }}` 표시, 제목 `[EKODI] 이메일 회원가입 인증`, 발신자 `EKODI 인증`; 비밀번호복구 Template에서도 `{{ .Token }}`을 출력하며 제목 `[EKODI] 비밀번호 재설정` 설정. 링크 템플릿은 별도로 동작할 수 있지만 본 UI는 코드 입력을 사용한다
4. Confirm Email 설정과 SMTP 발송/수신/재전송/만료/스팸 처리/복구 실증, 서비스별 세션 handoff와 동일 EKODI ID 조회가 성공했을 때만 게이트 승인
5. 로그인/회원가입 남용 방지: CAPTCHA, 이메일 요청 한도, 비밀번호 길이·유출 여부 검사, 브루트포스 차단. 외부 이메일을 대상으로 반복 대량 테스트하지 않음
6. 계정 복구는 일반 자동 SSO handoff보다 우선 실행되며, 인증코드 검증 후 비밀번호를 갱신하고 로그아웃한 뒤 재로그인하게 함
7. 기존 Google 로그인, 관리자 권한, 채널연동 OAuth, EKODI ID, 활동/포인트/구독 정보에 변화가 없어야 함

## 배포·활성화 스위치

코드를 먼저 병합·CI 검사·identity-api 및 Site Core의 보호 배포를 진행하더라도 세 가지 **서버 측 설정**이 모두 문자열 `true`가 아니면 `GET /identity-api/email/readiness`는 `enabled:false`를 반환하고 이메일 가입 UI를 표시하지 않는다.

- `EKODI_EMAIL_PASSWORD_ENABLED` : EKODI 사용자 이메일·비밀번호 가입/로그인 승인
- `EKODI_AUTH_EMAIL_CONFIRM_VERIFIED` : **Confirm Email 강제**와 확인 전 세션 차단을 실제 검증
- `EKODI_AUTH_SMTP_VERIFIED` : **EKODI Mail 발신자**, 인증·복구 이메일 수신과 비용·속도제한 실증

위 3개 값 모두 **identity-api Edge Function**의 서버 환경에서 관리한다. 프런트엔드나 Git 저장소에 비밀값을 넣지 않는다. 비밀값을 설정했어도 Auth 자체의 SMTP 구성과 템플릿이 자동 설정되는 것은 아니며, 설정값/작동검증 일치 여부는 별도 운영 기록으로 확인한다. 실패·장애 시 `EKODI_EMAIL_PASSWORD_ENABLED=false`로 다시 닫는다.

## 사용자 검증 시나리오

- 비운영 신규 이메일 가입 → 확인 전 로그인 차단 → EKODI Mail OTP → 인증 후 자동 Person/ekodi_id 최초 생성 → 이전 페이지 복귀
- 로그인/로그아웃 → 같은 EKODI ID가 교회·선교회·비즈 등에서 유지, FREE는 공통이지만 Workspace/admin/결제 권한은 별도
- 같은 이메일로 기존 Google 회원이 존재해도 본인 확인·명시적 연결 없이 다른 Person에 병합되지 않음
- 만료/잘못된 OTP, 중복가입, 인증메일 재전송 한도, 비밀번호 재설정, 발송 장애, 정지된 계정, 잘못된 URL 확인
- 브라우저 로그인 세션, 인증/회복 상태가 로그나 오류 메시지에 비밀번호/토큰·가입 여부를 노출하지 않음
- 실제 운영 테스트 계정 생성은 운영자 별도 승인, 삭제/정리 기록과 함께 진행

참조: https://supabase.com/docs/guides/auth/passwords · https://supabase.com/docs/guides/auth/auth-smtp · https://supabase.com/docs/guides/auth/auth-email-templates
