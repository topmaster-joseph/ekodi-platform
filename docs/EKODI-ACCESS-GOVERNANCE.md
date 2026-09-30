# EKODI Access Governance

## 목적

EKODI의 사람·외부협력자·AI 권한을 하나의 중앙 정책으로 판정하되, 실제 접근은 운영주체(tenant) 범위를 넘지 않도록 한다.

권한 판정 순서는 다음과 같다.

`Identity → Role → Tenant Scope → Capability → Expiry/Policy → Allow or Deny → Audit`

## 관리자 책임

- EKODI 최고관리자는 중앙 `Clients · 사용자·외부협력자 권한` 화면에서 모든 운영주체의 접근권한을 조회·등록·회수한다.
- 운영주체 관리자 권한은 자신의 tenant 범위에서만 유효하다.
- tenant 역할명에 `admin`이 포함되더라도 플랫폼 관리자 권한으로 승격되지 않는다.
- 민감 권한은 역할 프리셋에 포함하지 않고 deny가 allow보다 항상 우선한다.

## 외부개발자 표준

역할: `external_developer`

필수 식별정보:

- 본인 Google 계정 이메일
- 본인 GitHub 사용자명
- 접근 만료일

허용 기본값:

- tenant 대시보드 조회
- 사이트 소스 확인
- 개발/미리보기 확인
- 제한된 로그 조회
- 테스트 실행
- PR 생성

항상 금지:

- 회원 개인정보 원본
- 회원관리 권한
- 재정·결제 데이터
- 비밀키·Secret
- 플랫폼 관리자 권한
- 운영환경 직접 배포

외부개발자 권한은 최대 180일이며, 만료 이후 Google 통합 로그인과 workspace 권한 판정 모두 거부한다. 세션도 grant 만료시각을 넘겨 발급하지 않는다.

## 개발·배포 경계

외부개발자는 tenant 앱 저장소 또는 fork/작업 브랜치에서 개발하고 PR을 제출한다. 운영배포는 EKODI의 중앙 검증·승인·배포 가드레일을 거친다. Cloudflare, Supabase 서비스키, GitHub Actions Secret 등 운영 비밀정보는 개발자 계정에 제공하지 않는다.

권장 흐름:

`외부개발자 → tenant 작업공간/fork → PR → 자동검증 → EKODI 승인 → guarded deploy → 실서비스 검증`

## 하위서비스 적용

`tenant-admin-policy.js`를 사용하는 하위 운영공간은 동일한 `external_developer` capability 프리셋을 사용한다. 외부개발자에게 운영 관리자 메뉴 전체를 복제하지 않으며 현재 공통 관리자 화면에서는 안전한 조회 범위만 노출한다. 사이트별로 별도의 강한 역할을 새로 만들지 않는다.

Google 고객 접근권한은 `customer_access_grants`가 원본이며 다음 메타데이터를 함께 보존한다.

- `principal_type`
- `github_username`
- `capabilities_json`
- `denied_capabilities_json`
- `expires_at`
- `updated_at` / `updated_by`

권한 생성·갱신·회수는 `customer_access_grant_audit`에도 남긴다.

## 운영 원칙

1. 공유 계정과 비밀번호 공유를 금지한다.
2. 외부협력자는 개인 식별 계정으로만 등록한다.
3. 최소권한과 tenant 격리를 기본값으로 한다.
4. 기간제 권한은 만료 시 자동 차단한다.
5. 외부개발자에게 운영배포·Secret·권한관리 권한을 부여하지 않는다.
6. 기존 회원·관리자 권한은 추가형 마이그레이션으로 호환한다.
7. 권한 변경은 감사로그를 남긴다.
