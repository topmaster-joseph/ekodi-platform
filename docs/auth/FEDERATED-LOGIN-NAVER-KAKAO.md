# EKODI 계정 — 네이버·카카오 로그인 경로 (휴면 상태로 구축)

기준일: 2026-10-27 · 상태: **구축 완료 / 비활성(휴면)**

## 원칙

- 어떤 경로(Google·네이버·카카오)로 인증하든 결과는 **하나의 EKODI 계정**(`people`, 고유 `ekodi_id`)이다.
- 인증 경로는 `login_identities.provider`에 기록된다 (`google` / `naver` / `kakao`). 감사 기록은 `identity_audit_logs.provider`.
- 같은 사람이 여러 경로를 쓰려면 로그인한 상태에서 **계정 추가(연결)** 흐름으로 합친다. 이메일이 같다는 이유만으로 자동 병합하지 않는다(계정 탈취 방지).

## 구조

| 구성요소 | 역할 |
|---|---|
| `supabase/functions/identity-api/federated-providers.ts` | 네이버·카카오 인가코드 교환 및 프로필 조회 어댑터, 경로별 별칭 인증사용자 이메일 생성 |
| `supabase/functions/identity-api/index.ts` | 어댑터 등록(비밀값이 있을 때만), `/providers/{id}/challenge·exchange·link/*` 처리, `authorizeUrl` 발급 |
| `auth-site/federated-login.js` | 로그인 화면 버튼, 콜백 처리(원래 `site`/`return_to` 복원), 계정 추가 버튼, 경로 라벨 |
| `auth-site/auth-router.js` | 콜백을 모든 사이트별 로그인 스크립트보다 먼저 처리, 관리자(`site=admin`) 화면에는 버튼 미표시 |
| `public.identity_providers` | 운영 스위치 (`kakao`, `naver` 모두 `enabled=false`로 시드됨) |

네이버·카카오 계정은 Supabase 인증사용자를 `identity+{provider}.{sha256(provider:subject) 32자}@ekodi.kr`(메일 발송 없음) 별칭으로 만든다. 실제 이메일(제공된 경우)은 `login_identities.email`에 저장된다. Google 경로는 변경 없음.

## 활성화 조건 (두 관문이 모두 열려야 동작)

1. **비밀값** — identity-api Edge Function secrets
   - 네이버: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
   - 카카오: `KAKAO_REST_API_KEY`, (클라이언트 시크릿 사용 시) `KAKAO_CLIENT_SECRET`
   - 선택: `EKODI_FEDERATED_REDIRECT_URI` (기본값 `https://ekodi.kr/auth/`)
2. **운영 스위치** — `update public.identity_providers set enabled = true, updated_at = now() where provider = 'naver';` (카카오는 `'kakao'`)

어느 하나라도 닫혀 있으면 `/providers` 목록에 나타나지 않고 버튼도 표시되지 않는다. 비활성화는 2번을 `false`로 되돌리면 즉시 적용된다.

## 활성화 전 사업자 콘솔 준비

- 네이버 개발자센터: 애플리케이션 등록 → 네이버 로그인 API, Callback URL `https://ekodi.kr/auth/`, 제공 정보(이메일·이름) 선택.
- 카카오 디벨로퍼스: 앱 생성 → 카카오 로그인 활성화, Redirect URI `https://ekodi.kr/auth/`, 동의항목(닉네임, 카카오계정 이메일) 설정.

## 확인필요 (활성화 전 점검)

- 네이버 토큰·프로필 엔드포인트 명세는 공식 개발자 문서로 최종 대조 필요(카카오는 공식 REST API 문서로 확인, 2026-10 기준).
- 네이버는 이메일 인증 여부를 제공하지 않으므로 이메일 기반 권한(사전등록·초대 이메일 매칭)은 네이버 경로에 자동 적용되지 않는다. 필요한 서비스는 계정 연결 후 이용하도록 안내.
- 일부 서비스 게이트는 `provider='google'` 신원을 명시적으로 요구한다(예: 교회 담임목사 권한). 네이버·카카오 단독 계정은 해당 게이트를 통과하지 않는 것이 의도된 동작인지 서비스별 확인.
- 관리자 화면의 기존 로그인 방식 토글(D1 `auth_login_providers`)은 이 Supabase 스위치와 아직 연동되지 않음 — 관리자 화면에서 켜고 끄려면 후속 연동 필요.

## 2026-10-27 추가 — 모든 기능은 에코디 계정 기준

- 네이버·카카오로 로그인해도 같은 사람의 에코디 계정에 기본(주) 로그인 수단이 있으면 **그 에코디 계정 세션으로 전환**된다(`canonicalAccountSession`). 따라서 과거 Google 전용이던 기능도 그대로 동작한다.
- 권한 판단은 로그인 경로가 아니라 `public.ekodi_account_for_auth_user()`가 돌려주는 **에코디 계정 증명**(연결된 모든 경로, 검증된 이메일)으로 한다: 회원권한 접근(access-api), 빈 사이트 관리자 지정, 교회 목회자 권한(church-pastor-api), 서남권 의대 시민의견 게시판.
- 이메일로 부여된 권한은 **검증된 이메일**(`login_identities.email_verified`)에만 적용된다. 네이버 이메일은 검증으로 보지 않는다.
- 마이그레이션: `supabase/migrations/20261027120000_ekodi_account_unified_proof.sql` (추가형, 함수 배포보다 먼저 적용).
