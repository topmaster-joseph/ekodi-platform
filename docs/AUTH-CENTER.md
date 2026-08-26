# EKODI 통합 인증 운영 표준

## 핵심 모델

EKODI 인증은 `사람(Person)`, `로그인 수단(Identity)`, `기본 회원권(Free Membership)`, `소속/공간(Workspace)`, `권한(Permission)`을 분리한다.

- 한 사람은 하나의 EKODI Person을 가진다.
- 첫 Google 본인확인이 성공하면 EKODI Person을 만들고 EKODI 생태계의 기본 무료회원으로 본다.
- 한 Person에는 개인 Gmail, 기관 Google Workspace 등 여러 Google Identity를 연결할 수 있다.
- 하나의 Google Identity만 사용해도 개인, 상가, 상인회, 기관 등 여러 Workspace에 동시에 참여할 수 있다.
- Google 이메일은 본인확인 수단이지 회원 종류나 데이터 소유권의 기준이 아니다.
- 기본 무료회원 자격은 EKODI 전체에서 재사용하지만, 유료기능·사업장 데이터·단체 역할·관리자 권한은 서비스와 Workspace별로 따로 검증한다.
- 권한과 데이터는 Workspace별로 분리한다.
- 계정 연결은 이메일 문자열 유사성으로 자동 병합하지 않는다. 현재 로그인 세션과 추가 Google 계정의 소유권을 모두 검증한 경우에만 연결한다.
- 이미 각각 로그인해 별도 Person이 만들어진 두 Google 계정도 양쪽 소유권을 명시적으로 검증하면 하나의 Person으로 병합할 수 있다.

개념 구조:

`Person → Login Identities → Free Membership → Memberships/Roles → Tenant/Store Workspace → Subscription/Data`

## One Login / Invisible Auth 원칙

정상적인 사용자 흐름에서 `auth.ekodi.kr`은 방문 목적지가 아니라 보이지 않는 인증 인프라다.

- 사용자는 EKODI 생태계에서 최초 1회만 Google 계정으로 본인을 확인한다.
- 이후 처음 방문하는 EKODI 서비스라도 중앙 로그인 세션이 유효하면 Google 계정을 다시 선택하지 않는다.
- 서비스가 인증을 요구하면 `auth.ekodi.kr`을 경유하되 기존 세션이 있으면 즉시 일회용 handoff를 발급하고 원래 서비스로 돌아간다.
- 정상 성공 시 인증센터의 설명 화면, Workspace 목록, 계정 목록을 사용자에게 노출하지 않는다.
- 최초 로그인 또는 인증 실패가 있을 때만 최소한의 Google 로그인/재시도 UI를 보여 준다.
- `manage=1`, `review=1` 같은 명시적 운영 모드에서만 계정관리·검수 UI를 표시한다.
- 인증센터에서 성공한 로그인은 서비스 이용권한을 자동 승격하지 않는다. 신원은 공통이고 권한은 로컬이다.
- `admin`, 결제, 특정 고객 전용 공간, tenant/store 데이터처럼 권한 상승이 필요한 영역은 중앙 로그인과 별개로 서버에서 다시 검증한다.

정상 흐름:

`서비스 → auth.ekodi.kr(기존 세션 확인) → 일회용 handoff → 서비스`

최초 흐름:

`서비스 → auth.ekodi.kr → Google 본인확인 1회 → EKODI Person/무료회원 → 일회용 handoff → 서비스`

실패 흐름:

`서비스 → auth.ekodi.kr → 실패 메시지 + 다시 시도`

## 원칙

- 인증 진입점은 `https://auth.ekodi.kr` 하나로 통일한다.
- 공개 홈페이지 자체는 로그인 없이 열어 둔다.
- 회원기능, 개인화 기능, 정회원, 점포관리, 고객계정, 관리자 기능에 들어갈 때만 중앙 인증을 거친다.
- 각 서비스는 `site`와 `return_to`를 전달한다.
- `return_to`는 중앙 허용목록에 등록된 HTTPS origin만 허용한다.
- 인증은 Google 계정을 기본으로 하고, 서비스 권한은 별도 권한 원장에서 관리한다.
- `people`과 `login_identities`는 인증 주체를 표현하고 기존 `auth.users`, `tenant_members`, `store_members`, `site_access_registry`는 호환 계층으로 유지한다.
- 일반 무료회원 신원 handoff는 서비스 방문 이력을 요구하지 않는다.
- 제한 기능의 권한이 없는 사용자는 허용된 서비스에서만 접근 신청을 제출하고 관리자 또는 tenant admin이 승인한다.
- 서비스로 이동할 때는 서버가 생성한 일회용 handoff만 사용한다.
- Workspace 권한이 필요한 handoff는 사용자가 선택한 `workspace_key`를 서버에서 다시 검증한 뒤 발급한다.
- 브라우저에 신뢰 가능한 권한값, 서비스 role, service key, 관리자 비밀키를 저장하지 않는다.

## Workspace 규칙

- 개인 공간은 Person에 귀속한다.
- 사업장 공간은 Store/Tenant에 귀속한다.
- 상인회·기관·단체 공간은 해당 Tenant에 귀속한다.
- 같은 사람이 같은 서비스에서 여러 Workspace를 가질 수 있다.
- 일반 서비스 첫 진입은 공통 무료회원 신원으로 시작하고, Workspace 선택이 실제로 필요한 기능에서만 공간 선택 UI를 연다.
- Marketing AI 무료 개인 공간과 유료 사업장 공간은 동시에 존재할 수 있다.
- 이미 Marketing AI 사업장 하나를 사용 중이어도 다른 사업장용 Pro를 추가 신청할 수 있어야 한다.
- Workspace 전환은 데이터 병합이 아니다. 선택된 공간의 tenant/store 경계가 그대로 유지된다.

## Google 계정 연결 규칙

1. 첫 Google 로그인 시 Google `sub`와 검증된 이메일을 `login_identities`에 기록하고 Person을 생성한다.
2. Person 생성과 동시에 EKODI 전체의 기본 무료회원 신원을 성립시킨다.
3. `Google 계정 추가`는 현재 EKODI 세션을 유지한 채 별도의 nonce로 추가 Google 계정 소유권을 검증한다.
4. 추가 계정이 아직 Person에 속하지 않았다면 현재 Person에 연결한다.
5. 추가 계정이 별도 Person으로 이미 초기화되어 있어도 양쪽 소유권이 검증된 명시적 연결 흐름에서는 Person을 병합한다.
6. 연결된 Identity들의 기존 tenant/store membership과 사전등록 권한을 같은 Person의 auth user들에 동기화한다.
7. 이메일 주소만 일치하거나 비슷하다는 이유로 Person을 합치지 않는다.
8. 계정 해제 기능은 잠금·권한상실 위험을 별도로 설계하기 전까지 자동 제공하지 않는다.

## 서비스 분류

### 공통 무료회원 신원으로 바로 진입 가능한 기본 서비스

`portal`, `my`, `work`, `community`, `church`, `biz`, `trade`, `mall`, `books`, `lab`, `mission`, `edu`, `media`, `social`, `energy`, `messenger`, `invest`, `support`, `publishing`, `money`, `mail`, `live`, `cloud`, `cafe`

이 서비스들은 평상시 중앙 EKODI Identity handoff를 사용한다. 서비스 내부의 유료 기능이나 조직 데이터 접근은 서비스가 별도로 검증한다.

### 별도 권한 흐름을 유지하는 서비스/컨텍스트

- `admin`: platform_admin 별도 검증
- `pay`: 결제/정산 권한 별도 검증
- `cgma`: 상인회 정회원/tenant 권한 별도 검증
- `business`: Business OS 권한이 있으면 workspace handoff, 없으면 EKODI 무료회원 신원 handoff
- `marketing`: 무료회원 진입 + Pro/사업장 승인 흐름 유지
- `author`: 무료 Creator Workspace 자동 준비 흐름 유지
- 고객 전용 client realm: 통합 로그인은 재사용하되 실제 고객 데이터 권한은 대상 서비스가 별도로 검증

## 적용 규칙

로그인 버튼은 각 사이트에서 직접 Google OAuth나 Magic Link를 실행하지 않고 다음 주소로 보낸다.

`https://auth.ekodi.kr/?site=<service-key>&return_to=<encoded-target>`

계정 관리 화면이 필요한 경우 인증센터의 `manage=1` 모드를 사용한다.

공개 페이지는 인증을 강제하지 않는다. 서비스 내부에서 계정이 필요한 화면만 중앙 인증을 사용한다.

## 권한 기본값

- EKODI Person: 생태계 공통 기본 무료회원 신원
- `admin`: `platform_admin`, 자동 부여 금지
- `pay`: 사전등록/결제 권한 전용, 자동 부여 금지
- `marketing`: 개인 무료 공간 + 승인형 사업장 `store_owner`, 추가 사업장 신청 가능
- `cgma`: `member`, 청계 tenant 기준 신청 가능
- `business`: 무료회원 진입 허용, 실제 EKODIBIZ/점포 데이터는 별도 workspace 권한 필요
- 기타 회원형 서비스: 무료회원 신원으로 시작하고 제한 기능만 별도 권한 확인
- `portal`: 공개 포털, 필요 기능에서만 로그인

## 보안 불변조건

- Google 로그인 성공과 서비스 권한 승인을 같은 의미로 취급하지 않는다.
- URL fragment의 임의 문자열을 권한 근거로 신뢰하지 않는다. handoff token은 서버 발급 및 대상 서비스에서 검증한다.
- tenant/store 데이터는 해당 membership 검증 없이 노출하지 않는다.
- platform admin 권한은 고객 사이트 세션으로 자동 전이하지 않는다.
- 기존 세션 확인, CDN 로드, API handoff는 시간 제한을 두어 무한 대기 화면을 만들지 않는다.
- 인증 실패 시 사용자가 쿠키 삭제나 시크릿창 같은 복구 작업을 해야 정상 동작하는 구조를 허용하지 않는다.

## 배포·회귀 규칙

shared auth 변경은 작은 가역적 변경으로 배포하고 실제 운영 도메인까지 확인한다.

필수 회귀 시나리오:

- 최초 Google 로그인 1회 후 다른 미방문 일반 서비스에서 Google 재로그인 없이 진입
- 기존 EKODI 로그인 세션으로 `my`, `work`, `church`, `biz`, `books` 등 서로 다른 서비스 간 연속 이동
- Business OS 권한 보유자는 workspace handoff 유지
- Business OS 권한 미보유자는 무료회원 신원으로 진입하되 사업장 데이터는 비공개 유지
- Google 로그인 실패 시 무한 로딩 없이 재시도 UI 표시
- 세션 조회/API handoff 지연 시 시간 제한 후 복구 UI 표시
- Google 계정 1개 + 개인 Marketing AI + 사업장 1개
- Google 계정 1개 + 사업장 여러 개
- 개인 Gmail + 기관 Workspace 계정 연결
- 각각 한 번씩 로그인해 별도 Person이 만들어진 두 Google 계정의 명시적 병합
- 같은 사람이 상인회와 상가에 동시에 소속
- 다른 Person의 Google 계정을 무단 병합하려는 시도 차단
- 선택하지 않은 tenant/store로 privileged handoff 불가
- 관리자·결제 권한 회귀 없음

## 운영 체크

1. Google OAuth/GSI client 활성 상태
2. Supabase Auth Site URL 및 Redirect allow list
3. `identity-api` nonce, Google `sub`, 연결 계정 충돌 처리
4. `identity-api /session/handoff`의 동일 사용자 검증
5. `current_site_workspaces()`의 Person 기반 권한 조회
6. `access-api` 및 전문 handoff의 workspace-scoped 권한 검증
7. 일반 서비스는 `client-auth.js` 기반 seamless identity handoff 사용
8. 계정관리/검수 UI는 명시적 운영 모드에서만 노출
9. 토큰이 로그, HTML, localStorage 커스텀 키 등에 노출되지 않는지
10. tenant/store 데이터 경계가 무료회원 신원과 무관하게 유지되는지
