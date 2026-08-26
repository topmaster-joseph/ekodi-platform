# EKODI 통합 인증 운영 표준

## 1. 핵심 원칙

EKODI에서는 사람은 한 번만 회원이 된다. 서비스가 늘어나도 회원가입은 늘어나지 않는다.

EKODI 인증은 `사람(Person)`, `로그인 수단(Identity)`, `기본 무료회원 자격(Free Membership)`, `소속/공간(Workspace)`, `권한(Permission)`, `구독(Subscription)`을 분리한다.

- 최초 Google 본인확인 성공 시 하나의 EKODI Person을 만들고 EKODI 생태계 공통 무료회원 신원을 성립시킨다.
- 같은 사람이 이후 처음 방문하는 다른 EKODI 사용자 서비스에서도 Google 로그인이나 서비스별 회원가입을 반복하지 않는다.
- Google 이메일은 본인확인 수단이지 회원 종류, Workspace 소유권, 유료등급 또는 관리자 권한의 근거가 아니다.
- 무료회원 자격은 생태계 공통이지만 유료 기능, 사업장 데이터, 단체 역할, 결제·정산, 관리자 권한은 서비스와 Workspace별로 별도 검증한다.
- 한 Person에는 개인 Gmail과 기관 Google Workspace 등 여러 Google Identity를 명시적 소유권 확인 후 연결할 수 있다.
- 이메일 문자열이 같거나 비슷하다는 이유만으로 서로 다른 Person을 자동 병합하지 않는다.

개념 구조:

`Person → Login Identities → Universal FREE → Service Membership/Role → Workspace → Subscription/Data`

## 2. One Login / Invisible Auth

정상적인 사용자 흐름에서 `https://auth.ekodi.kr`은 방문 목적지가 아니라 보이지 않는 인증 인프라다.

### 최초 로그인

`EKODI 서비스 → auth.ekodi.kr → Google 본인확인 1회 → EKODI Person → 공통 FREE → 일회용 handoff → 원래 서비스`

### 이후 로그인

`다른 EKODI 서비스 → auth.ekodi.kr(기존 중앙 세션 확인) → 일회용 handoff → 원래 서비스`

기존 중앙 세션이 유효하면 사용자는 인증센터의 설명 화면이나 Google 계정 선택창을 볼 필요가 없다. 처음 방문하는 서비스라도 동일하다.

### 실패 시

`서비스 → auth.ekodi.kr → 실패 메시지 → 다시 시도`

- 세션 확인, 외부 로그인 라이브러리 로드, handoff API에는 시간 제한을 둔다.
- 무한 로딩 화면을 허용하지 않는다.
- 인증 실패 복구를 위해 사용자가 쿠키 삭제나 시크릿창 사용을 해야 하는 구조를 정상 흐름으로 간주하지 않는다.
- 정상 성공 시 인증센터 페이지, Workspace 목록, 계정 목록을 노출하지 않는다.
- `manage=1`, `review=1` 등 명시적 관리·검수 모드에서만 필요한 관리 UI를 표시한다.

## 3. 공통 무료회원 정책

무료회원 범위의 단일 기준은 `config/universal-membership.json`과 `config/ecosystem-services.json`이다.

- `config/ecosystem-services.json`에 등록된 모든 사용자 서비스는 EKODI 공통 FREE를 상속한다.
- 새로운 사용자 서비스를 레지스트리에 추가하면 별도의 회원가입 로직을 만들지 않아도 같은 FREE 정책을 자동 상속한다.
- 기본 정책 ID는 `one-account-free-everywhere-pay-where-needed`다.
- 기본 등급은 `free`다.
- 서비스별 무료회원 레코드는 사용자가 실제 해당 서비스를 처음 사용할 때 지연 생성(lazy materialization)할 수 있다.
- 아직 서비스별 레코드가 생성되지 않았더라도 중앙 Person의 FREE 자격은 유효하다.
- 유료 플랜은 공통으로 자동 승격하지 않고 서비스별로 독립 업그레이드·다운그레이드한다.

즉, `무료회원 신원은 전체 생태계 공통`, `유료권한과 업무권한은 필요한 곳에서만 별도`가 기준이다.

## 4. 서비스 라우팅 원칙

일반 사용자 서비스는 하드코딩된 서비스 목록을 인증 기준으로 삼지 않는다. 중앙 서비스 레지스트리를 읽어 공통 Identity handoff를 상속한다.

기본 진입:

`https://auth.ekodi.kr/?site=<service-key>&return_to=<encoded-target>`

- `return_to`는 해당 서비스의 허용된 HTTPS origin만 허용한다.
- 일반 서비스는 중앙 세션이 있으면 즉시 `identity-api /session/handoff`를 통해 일회용 handoff를 받는다.
- 처음 로그인한 사용자는 Google 검증 후 같은 handoff 흐름으로 들어간다.
- 서비스는 handoff로 받은 사용자 신원을 검증한 뒤 자체 세션을 만든다.
- 서비스 방문 이력이나 사전 회원가입 여부는 공통 무료회원 진입 조건이 아니다.

## 5. 특수 권한 흐름

공통 FREE가 있다고 해서 높은 권한이 자동 부여되지는 않는다.

### Admin

- `admin.ekodi.kr`은 platform admin 권한을 별도 검증한다.
- 무료회원 또는 일반 서비스 로그인만으로 관리자 권한을 얻을 수 없다.

### Business OS

- Business OS 전용 Workspace 권한이 있으면 기존 `business-handoff-api`의 검증된 Workspace handoff를 우선 사용한다.
- 해당 Workspace 권한이 없더라도 EKODI 공통 무료회원 신원으로 Business OS의 무료 범위에는 진입할 수 있다.
- 주문, 고객, 매출, 점포 등 실제 사업장 데이터는 별도 Workspace membership 확인 없이는 노출하지 않는다.

### Marketing AI

- 공통 FREE 신원으로 무료 범위에 진입할 수 있다.
- Pro, 사업장, 자동 실행 등 추가 기능은 서비스별 플랜과 Workspace 권한을 별도 검증한다.
- 개인 무료 공간과 유료 사업장 공간은 동시에 존재할 수 있다.

### Creator / Author

- 중앙 Google 로그인을 다시 요구하지 않는다.
- 개인 Creator Workspace가 필요한 경우 서비스가 첫 사용 시 자동 준비할 수 있다.
- Creator 전용 데이터와 권한은 해당 서비스가 관리한다.

### Pay / 결제·정산

- Pay가 사용자 서비스로 등록되어 있으면 공통 FREE 신원 자체는 상속할 수 있다.
- 그러나 결제수단 등록, 결제 실행, 정산, 환불, 자금 이동 권한은 무료회원 자격과 분리해 별도 승인·검증한다.

### Tenant / Store / 고객전용 서비스

- 중앙 로그인 상태는 재사용한다.
- 특정 상인회, 기관, 점포, 고객 데이터에 대한 실제 접근은 해당 tenant/store/customer membership을 서버에서 별도 확인한다.
- 중앙 FREE를 tenant membership으로 간주하지 않는다.

## 6. Workspace 규칙

- 개인 공간은 Person에 귀속한다.
- 사업장 공간은 Store/Tenant에 귀속한다.
- 상인회·기관·단체 공간은 해당 Tenant에 귀속한다.
- 같은 Person이 여러 Workspace에 동시에 소속될 수 있다.
- 일반 서비스 진입에서 Workspace 선택이 필요하지 않으면 인증센터에서 선택 화면을 보여 주지 않는다.
- 실제 기능이 특정 Workspace를 요구할 때만 Workspace를 선택하거나 기존 컨텍스트를 이어받는다.
- Workspace 전환은 데이터 병합이 아니다. tenant/store 데이터 경계는 그대로 유지한다.
- Workspace handoff는 전달받은 `workspace_key`를 서버에서 다시 검증한 뒤 발급한다.

## 7. Google Identity 연결 규칙

1. 첫 Google 로그인 시 검증된 Google `sub`와 이메일을 `login_identities`에 기록하고 Person을 생성한다.
2. Person 생성과 동시에 생태계 공통 FREE 자격을 성립시킨다.
3. 추가 Google 계정 연결은 현재 EKODI 세션과 새 Google 계정의 소유권을 모두 검증한다.
4. 새 Identity가 아직 Person에 속하지 않았다면 현재 Person에 연결한다.
5. 별도 Person으로 이미 초기화된 계정의 병합은 양쪽 소유권이 명시적으로 검증된 경우에만 수행한다.
6. 연결된 Identity의 기존 tenant/store membership과 사전등록 권한은 Person 기준으로 필요한 호환 계층에 동기화한다.
7. 계정 해제는 잠금·권한상실 방지 규칙이 완성되기 전까지 자동 제공하지 않는다.

## 8. 보안 불변조건

- Google 로그인 성공과 서비스 이용권한 승인을 같은 의미로 취급하지 않는다.
- 공통 FREE와 유료·관리자·tenant/store 권한을 같은 값으로 취급하지 않는다.
- URL fragment의 임의 문자열을 권한 근거로 신뢰하지 않는다. handoff token은 서버에서 발급하고 대상 서비스에서 검증한다.
- 브라우저에 관리자 비밀키, 서비스 role의 신뢰값, tenant 권한의 원본을 저장하지 않는다.
- tenant/store/customer 데이터는 해당 membership 검증 없이 노출하지 않는다.
- platform admin 권한은 일반 서비스 세션으로 자동 전이하지 않는다.
- 높은 영향의 결제·정산·계약·외부실행 권한은 공통 로그인만으로 허용하지 않는다.

## 9. 배포 및 회귀 기준

shared auth 변경은 작은 가역적 변경으로 배포하고 운영 도메인까지 확인한다.

필수 회귀 시나리오:

- 최초 Google 로그인 한 번으로 EKODI Person과 공통 FREE가 성립한다.
- 이후 한 번도 방문하지 않은 다른 레지스트리 사용자 서비스에서 Google 재로그인 없이 진입한다.
- 새로운 사용자 서비스를 레지스트리에 추가했을 때 별도 auth 코드 수정 없이 FREE를 상속한다.
- 기존 중앙 세션으로 My EKODI, Work, Church, Biz, Books 등 서로 다른 서비스 사이를 연속 이동한다.
- Business OS 권한 보유자는 기존 Workspace handoff를 유지한다.
- Business OS 권한 미보유자는 무료 범위에만 진입하고 사업장 데이터는 보지 못한다.
- Marketing/Creator의 기존 전문 권한 흐름이 깨지지 않는다.
- Admin, 결제·정산, tenant/store/customer 권한이 FREE 때문에 상승하지 않는다.
- Google 로그인 실패, 세션 조회 지연, API handoff 지연 시 무한 대기 없이 재시도 상태가 표시된다.
- 개인 Gmail과 기관 Google Workspace Identity의 명시적 연결이 가능하다.
- 다른 Person의 Google 계정을 무단 병합하려는 시도를 차단한다.
- 선택하지 않은 tenant/store로 privileged handoff를 만들 수 없다.

## 10. 운영 체크

1. Google OAuth/GSI client 활성 상태
2. Supabase Auth Site URL 및 Redirect allow list
3. `identity-api`의 nonce, Google `sub`, Identity 충돌 처리
4. `identity-api /session/handoff`의 동일 사용자 검증
5. `config/universal-membership.json`의 `singleEcosystemAccount`, `repeatSignupPerService=false`, 전체 레지스트리 FREE 정책
6. `config/ecosystem-services.json`과 생성된 사용자 서비스 레지스트리의 동기화
7. 일반 서비스의 registry-driven seamless Identity handoff
8. Business/Marketing/Admin 등 전문 권한의 별도 서버 검증
9. 세션·CDN·API timeout과 재시도 경로
10. 토큰과 민감정보가 로그, HTML, 커스텀 localStorage 키에 노출되지 않는지
11. tenant/store 데이터 경계가 공통 무료회원 신원과 무관하게 유지되는지
