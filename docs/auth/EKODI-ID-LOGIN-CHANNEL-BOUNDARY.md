# EKODI ID 단일 신원 / 외부 로그인 수단 / 외부 채널 연결 구분

상태: 운영 인증 구조 확인 및 UI 경계 정리 (2026-10-29). 이 문서는 새 로그인 사업자 활성화나 계정 연결 권한을 부여하지 않는다.

## 사용자가 원하는 간단한 구조

`외부 로그인 버튼(Google/네이버/카카오) → 공급자 본인확인 → EKODI 통합 Person + 고유 ekodi_id → 기존 EKODI 세션·서비스 권한·Workspace`

- **내부 신원은 하나**: 회원, 활동, 구독, 교회·선교회·비즈 등 각 사이트의 역할·포인트·소속은 검증된 EKODI `people` / `ekodi_id`(또는 그에 대응하는 내부 `person_id`)를 기준으로 연결한다. 공급자의 사용자 ID·이메일을 내부 회원 기본키로 사용하지 않는다.
- **외부 소셜계정은 로그인 입구**: 로그인 제공자는 `login_identities`에 `provider + 검증된 provider_subject` 형태로 연결하고, EKODI가 발급한 세션 및 일회용 서비스 handoff를 사용한다. 서비스마다 별도 가입 또는 소셜 계정을 만들지 않는다.
- **한 사람의 여러 로그인 수단은 명시적으로 연결**: 네이버·카카오·Google 로그인이 같은 이메일이라고 자동으로 같은 사람이라고 판단하지 않는다. EKODI에 로그인한 상태에서 새 공급자의 소유권을 검증해 연결한 경우에만 같은 Person을 공유한다. 이미 타인에게 연결된 계정, 미검증 이메일에 따른 권한 상승, 다른 사용자 자동 병합은 차단한다.
- **관리자·결제·사업장 권한은 별도**: 외부 소셜 인증 성공은 EKODI 회원 인증일 뿐 관리자 권한을 허용하지 않는다. 서버가 EKODI ID의 실제 membership·role·workspace를 검사한다.
- **로그인 직전 위치로 돌아가기**: `https://ekodi.kr/auth/`에서 인증한 뒤 승인된 원래 사이트·경로로 복귀한다. 기본적으로 `/my`로 이동시키지 않는다.

## 운영 상태와 서로 다른 관리 화면

| 관리 대상 | 정식 위치 / 기술 원장 | 현재 의미 |
|---|---|---|
| EKODI 회원·로그인 수단 | `/auth/`, `people`, `login_identities`, `identity-api`, `identity_providers` | Google 경로 사용, 네이버·카카오는 구현됐으나 두 관문(비밀값 + 운영 enabled)을 열기 전까지 휴면 |
| 외부 유튜브·인스타그램·페이스북 등 채널 계정 | `/admin/accounts/social-accounts`, `ekodi_social_account_links` 및 기존 서비스 연동기록 | 채널/계정 기록 조회용, 로그인 수단이나 사용자 인증의 원장이 아님. 신규 메타데이터 등록·채널 OAuth·자동게시 기본 차단 |
| 로그인 제공자 운영 스위치 | `identity_providers.enabled` + 로그인 공급자 서버 비밀값 | 최고관리자 외부 채널 목록의 13개 서비스 표시와 별개. 화면의 채널 '비활성화'를 회원 로그인 비활성화로 해석하면 안 됨 |

소셜 채널 관리 화면의 `socialIdentityPolicy.socialLoginEnabled=false`는 **해당 채널 메타데이터 등록 모듈에서 소셜 로그인 기능을 제공하지 않는다는 뜻**이지 `/auth/`의 실제 Google 로그인이나 향후 허가된 네이버·카카오 로그인을 전역 차단한다는 뜻이 아니다. 이 두 모듈의 상태를 같은 활성화 스위치로 합치지 않는다.

## 안전한 활성화 기준

1. Google 경로와 기존 EKODI 계정·권한·세션은 유지한다.
2. 네이버·카카오를 운영하려면 공급자 앱 등록, `https://ekodi.kr/auth/` 콜백 검증, 비밀값 준비, `identity_providers.enabled` 승인 및 인증·연결·권한 경계 실증을 각각 마쳐야 한다. 승인 전에는 숨김/휴면이다.
3. 향후 다른 소셜 서비스도 **로그인 공급자**로 별도 검토할 수 있지만, 채널 디렉터리에 있다는 이유로 자동 로그인 공급자가 되지 않는다.
4. 외부 채널 계정 연결·게시 권한은 로그인 제공자 활성화와 독립적으로 승인·검증한다. 외부 OAuth 토큰은 회원의 기본 ID가 아니다.
5. EKODI Orchestrator의 보호 CI·인증 실증·승인 배포가 완료되기 전에는 새 공급자 기능을 켜지 않는다.

참조: `docs/AUTH-CENTER.md`, `docs/auth/FEDERATED-LOGIN-NAVER-KAKAO.md`, `auth-site/federated-login.js`, `supabase/functions/identity-api/index.ts`, `social-identity-control.js`.
