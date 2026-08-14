# EKODI 통합 인증센터 운영 표준

## 핵심 모델

EKODI 인증은 `사람(Person)`, `로그인 수단(Identity)`, `소속/공간(Workspace)`을 분리한다.

- 한 사람은 하나의 EKODI Person을 가진다.
- 한 Person에는 개인 Gmail, 기관 Google Workspace 등 여러 Google Identity를 연결할 수 있다.
- 하나의 Google Identity만 사용해도 개인, 상가, 상인회, 기관 등 여러 Workspace에 동시에 참여할 수 있다.
- Google 이메일은 본인확인 수단이지 회원 종류나 데이터 소유권의 기준이 아니다.
- 권한과 데이터는 Workspace별로 분리한다.
- 계정 연결은 이메일 문자열 유사성으로 자동 병합하지 않는다. 현재 로그인 세션과 추가 Google 계정의 소유권을 모두 검증한 경우에만 연결한다.
- 이미 각각 로그인해 별도 Person이 만들어진 두 Google 계정도 양쪽 소유권을 명시적으로 검증하면 하나의 Person으로 병합할 수 있다.

개념 구조:

`Person → Login Identities → Memberships/Roles → Tenant/Store Workspace → Subscription/Data`

## 원칙

- 인증 진입점은 `https://auth.ekodi.kr` 하나로 통일한다.
- 공개 홈페이지 자체는 로그인 없이 열어 둔다.
- 회원, 정회원, 점포관리, 고객계정, 관리자, 개인화 기능에 들어갈 때만 중앙 인증센터를 거친다.
- 각 서비스는 `site`와 `return_to`를 전달한다.
- `return_to`는 중앙 허용목록에 등록된 HTTPS origin만 허용한다.
- 인증은 Google 계정을 기본으로 하고, 서비스 권한은 `site_access_registry`에서 별도로 관리한다.
- `people`과 `login_identities`는 인증 주체를 표현하고 기존 `auth.users`, `tenant_members`, `store_members`, `site_access_registry`는 호환 계층으로 유지한다.
- 미등록 사용자는 허용된 서비스에서만 접근 신청을 제출하고 관리자 또는 tenant admin이 승인한다.
- 승인 후 대상 서비스로 이동할 때는 서버가 생성한 일회용 handoff만 사용한다.
- handoff는 사용자가 선택한 `workspace_key`를 서버에서 다시 검증한 뒤 발급한다.
- 브라우저에 서비스 role, service key, 관리자 비밀키를 저장하지 않는다.

## Workspace 규칙

- 개인 공간은 Person에 귀속한다.
- 사업장 공간은 Store/Tenant에 귀속한다.
- 상인회·기관·단체 공간은 해당 Tenant에 귀속한다.
- 같은 사람이 같은 서비스에서 여러 Workspace를 가질 수 있다.
- 같은 서비스의 Workspace가 둘 이상이면 인증센터에서 `내 공간` 선택 UI를 표시한다.
- Marketing AI 무료 개인 공간과 유료 사업장 공간은 동시에 존재할 수 있다.
- 이미 Marketing AI 사업장 하나를 사용 중이어도 다른 사업장용 Pro를 추가 신청할 수 있어야 한다.
- Workspace 전환은 데이터 병합이 아니다. 선택된 공간의 tenant/store 경계가 그대로 유지된다.

## Google 계정 연결 규칙

1. 첫 Google 로그인 시 Google `sub`와 검증된 이메일을 `login_identities`에 기록하고 Person을 생성한다.
2. `Google 계정 추가`는 현재 EKODI 세션을 유지한 채 별도의 nonce로 추가 Google 계정 소유권을 검증한다.
3. 추가 계정이 아직 Person에 속하지 않았다면 현재 Person에 연결한다.
4. 추가 계정이 별도 Person으로 이미 초기화되어 있어도 양쪽 소유권이 검증된 명시적 연결 흐름에서는 Person을 병합한다.
5. 연결된 Identity들의 기존 tenant/store membership과 사전등록 권한을 같은 Person의 auth user들에 동기화한다.
6. 이메일 주소만 일치하거나 비슷하다는 이유로 Person을 합치지 않는다.
7. 계정 해제 기능은 잠금·권한상실 위험을 별도로 설계하기 전까지 자동 제공하지 않는다.

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

계정 관리 화면이 필요한 경우 인증센터의 `manage=1` 모드를 사용한다.

공개 페이지는 인증을 강제하지 않는다. 서비스 내부에서 계정이 필요한 화면만 인증센터를 사용한다.

## 권한 기본값

- `admin`: `platform_admin`, 신청 불가
- `pay`: 사전등록 전용, 신청 불가
- `marketing`: 개인 무료 공간 + 승인형 사업장 `store_owner`, 추가 사업장 신청 가능
- `cgma`: `member`, 청계 tenant 기준 신청 가능
- 기타 회원형 서비스: `member`, 신청 가능
- `portal`: 공개 포털, 인증 신청 없음

## 단계적 배포 순서

이 변경은 shared auth와 shared database에 영향을 주므로 운영환경에 직접 적용하지 않는다.

1. `staging/person-identity-workspaces` 소스 검증
2. Supabase staging/branch DB에서 migration 적용 및 함수 검증
3. staging `identity-api`, `access-api` 배포
4. staging auth-site에서 아래 회귀 시나리오 확인
5. 이상 없을 때에만 blue-green 방식으로 운영 전환
6. 운영 전환 후 실제 `auth.ekodi.kr` 및 고객 도메인 회귀 확인

필수 회귀 시나리오:

- 기존 Google 계정 1개 + 서비스 1개
- Google 계정 1개 + 개인 Marketing AI + 사업장 1개
- Google 계정 1개 + 사업장 여러 개
- 개인 Gmail + 기관 Workspace 계정 연결
- 각각 한 번씩 로그인해 별도 Person이 만들어진 두 Google 계정의 명시적 병합
- 같은 사람이 상인회와 상가에 동시에 소속
- 다른 Person의 Google 계정을 무단 병합하려는 시도 차단
- 선택하지 않은 tenant/store로 handoff 불가
- 관리자·결제 권한 회귀 없음

## 운영 체크

1. Google OAuth/GSI client 활성 상태
2. Supabase Auth Site URL 및 Redirect allow list
3. `identity-api` nonce, Google `sub`, 연결 계정 충돌 처리
4. `current_site_workspaces()`의 Person 기반 권한 조회
5. `access-api` workspace-scoped handoff
6. `auth-site/auth.js`의 내 공간 선택 및 Google 계정 추가
7. 승인 전 접근 차단 및 승인 후 handoff 검증
8. 토큰이 로그, HTML, localStorage 커스텀 키 등에 노출되지 않는지
9. tenant/store 데이터 경계가 Workspace 전환과 무관하게 유지되는지
