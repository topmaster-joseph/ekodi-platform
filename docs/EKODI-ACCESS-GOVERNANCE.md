# EKODI Access Governance

## 목적

EKODI 전체의 사람·외부협력자·AI 권한을 하나의 공통 구조로 관리한다. 청계면상인회나 특정 고객사이트 전용 정책이 아니라 플랫폼, 서비스, 운영공간, 개인에 동일하게 적용한다.

정규 권한 판정 순서는 다음과 같다.

`Identity → Scope → Role → Capability → Expiry / Explicit Deny → Allow or Deny → Audit`

Trust Layer의 정규 체계와 동일하게 권한 문법은 `namespace:resource.action`을 사용한다. 새로운 별도 권한 엔진을 만들지 않으며 최종 판정은 `ekodi-authorization.js`의 Scope/Capability 규칙을 사용한다.

## Scope

EKODI의 권한 범위는 네 종류만 사용한다.

- `platform` — EKODI 전체. 최고관리자만 명시적으로 부여한다.
- `service` — 에코디교회, 에코디비즈, 에코디몰, 청계면상인회, 각 전문서비스·공통서비스·하위사이트 등 하나의 서비스 경계.
- `workspace` — 개인·기관·단체·기업·매장·프로젝트 등 독립 운영공간. URL이나 표시명 대신 변하지 않는 workspace identity를 사용한다.
- `person` — 자기 개인 데이터 범위.

URL의 상하관계는 권한을 만들지 않는다. 상위 서비스 관리자라는 이유만으로 하위 서비스 변경권한이 자동 상속되지 않으며, 해당 Scope와 Capability가 함께 있어야 한다.

서비스 Scope의 공식 목록과 `/admin` 경로는 `admin-service-catalog.js`를 단일 기준으로 사용한다. 중앙 권한화면에서는 이 목록을 그대로 사용하므로 새 하위서비스가 공식 관리자 카탈로그에 등록되면 권한 선택 범위에도 포함된다.

## 역할 프리셋

역할명은 편의를 위한 입력값이고 실제 권한은 Capability로 판정한다.

- `platform_admin` — EKODI 전체 최고관리자. `platform` Scope만 가능.
- `service_admin` — 개별 서비스 관리자. 해당 `service` Scope만 가능.
- `workspace_admin` — 개별 운영공간 관리자. 해당 `workspace` Scope만 가능.
- `manager` — 중간관리자·운영책임자.
- `ai_manager` — 해당 범위의 AI 조회·운영 담당자.
- `staff` — 하위관리자·실무자.
- `viewer` — 조회·검수자.
- `external_developer` — 개발·테스트·PR에 필요한 최소 범위의 기간제 외부협력자.

하위 관리자가 위임할 수 있는 역할은 같은 Scope의 `manager`, `ai_manager`, `external_developer`, `staff`, `viewer`로 제한한다. 다른 최고관리자나 동급 상위관리자를 스스로 만들 수 없고, 임의 Capability 추가도 최고관리자만 할 수 있다.

## 중앙 및 하위 관리자

중앙 관리자 화면의 기존 `Clients` 슬롯은 사용자·고객사이트 전용 화면이 아니라 `EKODI 전체 권한` 화면으로 동작한다. 플랫폼 전체, 각 공식 서비스·사이트, 등록된 workspace를 선택하여 Google 계정별 역할과 만료일을 관리한다.

하위 서비스·운영공간의 관리자 API는 같은 `access_scope_grants` 데이터를 보되 자기 Scope의 `service:access.*` 또는 `workspace:access.*` 권한만 사용할 수 있다. 브라우저에서 메뉴를 숨기는 방식은 보안으로 인정하지 않고 서버에서 Scope와 Capability를 다시 확인한다.

플랫폼 전체 권한 변경은 `admin:accounts.write` 민감 Capability이므로 최고관리자의 추가 인증(elevation)이 필요하다.

## 외부개발자 표준

역할: `external_developer`

필수 식별정보:

- 본인 Google 계정 이메일
- 본인 GitHub 사용자명
- 접근 만료일

기본 허용:

- 지정 서비스/운영공간 조회
- 사이트 소스 확인
- 개발·미리보기 확인
- 제한된 로그 조회
- 테스트 실행
- PR 생성

항상 금지:

- 회원 개인정보 원본
- 재정·결제 데이터
- Secret·재사용 가능한 운영 자격증명
- 권한관리 위임
- 플랫폼 최고관리자 권한
- 운영환경 직접 배포·롤백
- 긴급 플랫폼 제어

외부개발자 권한은 최대 180일이다. deny가 allow보다 항상 우선하므로 요청 Capability 목록에 금지권한이 들어 있어도 허용되지 않는다.

## 저장·호환

전체 범위 권한 Registry는 `access_scope_grants`이며 권한 생성·갱신·회수는 `access_scope_grant_audit`에 기록한다. 이 테이블은 권한 데이터를 보관할 뿐 별도 판정 엔진이 아니다.

기존 `customer_access_grants`는 전환기간 동안 기존 고객 로그인 호환 원본으로 유지한다. 마이그레이션 `0091_universal_access_grants.sql`은 기존 고객 권한을 `workspace` Scope로 추가 투영하며 기존 테이블을 삭제하거나 축소하지 않는다. 기존 CGMA·자담·피자마루·요거트 사용자가 권한체계 전환 때문에 로그인되지 않는 회귀를 허용하지 않는다.

Trust Layer는 기존 권한과 신규 Scope 권한의 parity를 관찰한 뒤 별도 guarded cutover를 거친다. RLS와 각 서비스 로컬 보안경계는 권한 통합 이후에도 최종 방어선으로 유지한다.

## 개발·배포 경계

외부개발자는 지정된 서비스 저장소 또는 fork/격리 브랜치에서 개발하고 PR을 제출한다. 운영배포는 EKODI 중앙 검증·승인·배포 가드레일을 거친다. Cloudflare, Supabase 서비스키, GitHub Actions Secret 등 운영 비밀정보를 외부개발자에게 직접 제공하지 않는다.

`외부개발자 → 격리 작업공간/fork → PR → 자동검증 → EKODI 승인 → guarded deploy → 실서비스 검증`

## 운영 원칙

1. 공유 계정과 비밀번호 공유를 금지한다.
2. 개인별 Google 계정 등 검증 가능한 Identity로 권한을 부여한다.
3. 최소권한과 Scope 격리를 기본값으로 한다.
4. 기간제 권한은 만료 즉시 차단한다.
5. explicit deny가 모든 allow보다 우선한다.
6. URL·메뉴 위치·화면 표시 여부는 권한 근거가 아니다.
7. 신규 서비스는 공식 서비스 카탈로그와 관리자 경로에 등록한 뒤 같은 권한 모델을 사용한다.
8. 기존 사용자·고객 권한은 추가형 마이그레이션으로 호환한다.
9. 권한 변경은 감사로그를 남긴다.
10. 플랫폼 전체 민감 권한 변경은 최고관리자 추가 인증과 guarded release 원칙을 따른다.
