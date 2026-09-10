# EKODI 고객사이트 관리자 헌법

상태: 고정 표준
버전: v1
적용 대상: 모든 사용자사이트에 연결된 tenant-local 관리자 surface

## 불변 원칙

1. 역할마다 관리자 페이지를 복제하지 않는다.
2. 한 사용자사이트에는 하나의 관리자 진입점과 하나의 Admin Shell 계약을 둔다.
3. 로그인 후 `Person + Tenant/Workspace + Role + Scope + Capability`를 계산해 같은 화면의 메뉴·데이터·행동을 투영한다.
4. 최고관리자를 위한 `/superadmin`, `/master-admin` 같은 고객사이트 전용 페이지를 만들지 않는다.
5. 플랫폼 최고관리자가 고객사이트에 들어갈 때도 명시적인 tenant context 안에서만 고객사이트 권한을 행사한다.
6. `admin.ekodi.kr`은 EKODI 전체 Control Plane이며 고객사이트 로컬 관리자 화면을 대체하지 않는다.
7. 메뉴 숨김은 보조 UX일 뿐이다. 직접 URL, RPC, API, 데이터 쓰기는 서버 권한과 RLS에서 다시 검증한다.
8. 권한이 없는 영역은 같은 관리자 Shell 안에서 403/권한제한 상태로 처리하고 다른 관리자 페이지로 우회시키지 않는다.
9. 공통 헤더·사이드바·계정·로그아웃·스크롤·반응형 규칙은 Admin Shell이 소유하고 서비스는 업무 콘텐츠만 소유한다.
10. 새 사용자사이트와 기존 사용자사이트 모두 같은 정책을 적용한다.

## 표준 흐름

```text
Identity → Tenant/Workspace → Local Role → Capability → Admin Shell → Allowed UI/Data/Actions
```

`platform_admin` 문자열만으로 고객 데이터에 전역 우회권을 주지 않는다. 고객사이트 스냅샷이나 명시적 위임 컨텍스트가 반환한 로컬 권한일 때만 해당 tenant에서 사용한다.
