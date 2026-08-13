# EKODI 통합 인증센터 운영 표준

## 원칙

- 인증 진입점은 `https://auth.ekodi.kr` 하나로 통일한다.
- 공개 홈페이지 자체는 로그인 없이 열어 둔다.
- 회원, 정회원, 점포관리, 고객계정, 관리자, 개인화 기능에 들어갈 때만 중앙 인증센터를 거친다.
- 각 서비스는 `site`와 `return_to`를 전달한다.
- `return_to`는 중앙 허용목록에 등록된 HTTPS origin만 허용한다.
- 인증은 Google 계정을 기본으로 하고, 서비스 권한은 `site_access_registry`에서 별도로 관리한다.
- 미등록 사용자는 허용된 서비스에서만 접근 신청을 제출하고 관리자 또는 tenant admin이 승인한다.
- 승인 후 대상 서비스로 이동할 때는 서버가 생성한 일회용 handoff만 사용한다.
- 브라우저에 서비스 role, service key, 관리자 비밀키를 저장하지 않는다.

## 서비스 키

- `portal` → `ekodi.kr`
- `admin` → `admin.ekodi.kr`
- `cgma` → `cgma.ekodi.kr/member`
- `marketing` → `marketing.ekodi.kr`, `jadam.ekodi.kr`, `pizzamaru.ekodi.kr`, `yogurt.ekodi.kr`
- `biz` → `biz.ekodi.kr`
- `trade` → `trade.ekodi.kr`
- `mall` → `mall.ekodi.kr`
- `pay` → `pay.ekodi.kr`
- `books` → `books.ekodi.kr`
- `church` → `church.ekodi.kr`
- `lab` → `lab.ekodi.kr`
- `mission` → `mission.ekodi.kr`
- `community` → `community.ekodi.kr`
- `edu` → `edu.ekodi.kr`
- `media` → `media.ekodi.kr`

## 적용 규칙

로그인 버튼은 각 사이트에서 직접 Google OAuth나 Magic Link를 실행하지 않고 다음 주소로 보낸다.

`https://auth.ekodi.kr/?site=<service-key>&return_to=<encoded-target>`

공개 페이지는 인증을 강제하지 않는다. 서비스 내부에서 계정이 필요한 화면만 인증센터를 사용한다.

## 권한 기본값

- `admin`: `platform_admin`, 신청 불가
- `pay`: 사전등록 전용, 신청 불가
- `marketing`: `store_owner`, 신청 가능
- `cgma`: `member`, 청계 tenant 기준 신청 가능
- 기타 회원형 서비스: `member`, 신청 가능
- `portal`: 공개 포털, 인증 신청 없음

## 운영 체크

1. Google OAuth provider 활성 상태
2. Supabase Auth Site URL 및 Redirect allow list
3. `access-api` 서비스별 handoff origin
4. `auth-site/auth.js` 서비스 카탈로그
5. 대상 서비스 로그인 버튼이 중앙 인증센터만 가리키는지
6. 승인 전 접근 차단 및 승인 후 handoff 검증
7. 토큰이 로그, HTML, localStorage 커스텀 키 등에 노출되지 않는지
