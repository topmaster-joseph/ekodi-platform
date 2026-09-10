# EKODI 관리자 UI Shell 원칙

상태: 표준
버전: v2
적용 대상: EKODI 생태계의 관리자 화면(`admin` surface)

## 1. 구조 원칙

EKODI 공통 Shell은 화면 성격에 따라 UI Shell을 분리한다.

```text
EKODI Common Shell
├─ User Shell UI   → public / workspace
└─ Admin Shell UI  → admin
```

사용자 Shell과 관리자 Shell은 같은 공통 Shell 계약을 공유하지만 서로의 레이아웃 규칙을 침범하지 않는다.

## 2. 관리자 왼쪽 상단 헤더

관리자 좌측 사이드바 상단의 별도 브랜드/헤더 영역은 사용하지 않는다.

- `.side-brand`, `.sidebar-brand`, `.admin-sidebar-brand` 및 표준 `data-ekodi-admin-*` 브랜드 헤더는 제거한다.
- 로고·서비스명만을 위한 별도 상단 블록을 중복 배치하지 않는다.
- 사이드바는 상단 안전 여백 뒤에 바로 메뉴가 시작된다.
- 브랜드 식별은 전체 EKODI Shell과 현재 서비스 문맥에서 처리한다.

즉, **관리자 왼쪽 상단 헤더는 삭제가 기본 원칙**이다.

## 3. 좌측 내비게이션과 상단 세부메뉴

- 신규·개편 관리자 화면의 표준은 **2단 내비게이션**이다.
- 좌측에는 서비스의 1차 메뉴만 두고 데스크톱에서는 세로 스크롤을 만들지 않는다.
- 좌측 1차 메뉴를 선택하면 해당 메뉴의 2차 기능을 중앙 작업영역 상단의 세부메뉴에 표시한다.
- 상단 세부메뉴를 선택하면 중앙 작업영역의 실제 화면이 바뀐다.
- 계정·로그아웃은 좌측 하단에 고정하고 1차 메뉴와 함께 스크롤시키지 않는다.
- 레거시 관리자 화면은 마이그레이션 기간에 한해 독립 메뉴 스크롤을 유지할 수 있으나, data-ekodi-admin-nav-mode="primary" 계약으로 전환하는 것을 기본으로 한다.
- 표·코드·대용량 데이터처럼 필요한 영역 외에는 중첩 스크롤을 만들지 않는다.

## 4. 계정과 로그아웃

- 로그인 계정/프로필은 좌측 사이드바 하단에 둔다.
- 로그아웃은 계정 정보 바로 아래 또는 같은 하단 영역에 둔다.
- 상단 헤더나 우측 상단에 중복된 계정 정보가 있으면 숨긴다.
- 계정 영역과 로그아웃은 메뉴 스크롤과 분리해 항상 접근 가능하게 유지한다.

## 5. 관리자 상단 바

- 데스크톱에서는 중복 상단 바를 기본적으로 사용하지 않는다.
- 모바일에서는 메뉴 열기 등 실제 내비게이션에 필요한 최소 상단 바만 유지할 수 있다.
- 모바일 관리자 상단 바는 User Shell Header가 아니며 Admin Shell의 독립 UI다.
- 페이지 제목·계정 정보가 상단 바에 중복되면 공통 Shell이 숨길 수 있다.

## 6. 사용자 Shell과의 분리

- `shell/user-ui-header.js`는 `public`, `workspace`에만 적용한다.
- `shell/admin-ui-shell.js`는 `admin`에만 적용한다.
- 사용자용 고정 헤더 사전 스타일은 `admin` surface에 주입하지 않는다.
- 관리자용 sidebar/header 정규화는 사용자 화면에 적용하지 않는다.

## 7. 서비스별 자유 영역

Admin Shell 아래의 실제 관리 화면, 카드, 표, 폼, 대시보드, 색상, 서비스별 정보구조는 각 사이트의 목적에 맞게 설계한다. 공통 Shell은 다음만 표준화한다.

1. 좌측 상단 중복 헤더 제거
2. 좌측 1차 메뉴 고정·무스크롤
3. 상단 2차 세부메뉴와 중앙 작업영역 분리
4. 관리자 작업영역 스크롤
5. 계정/로그아웃 하단 고정
6. 사용자 Shell과 관리자 Shell의 분리

## 8. 표준 마크업 계약

신규 관리자 화면은 가능하면 명시적 데이터 속성을 사용한다.

```html
<aside data-ekodi-admin-sidebar>
  <nav data-ekodi-admin-nav data-ekodi-admin-nav-mode="primary">...</nav>
  <div data-ekodi-admin-sidebar-footer>
    <div data-ekodi-account>...</div>
    <button data-ekodi-logout>로그아웃</button>
  </div>
</aside>
<main data-ekodi-admin-main>
  <nav data-ekodi-admin-subnav>...</nav>
  ...
</main>
```

레거시 관리자 화면은 공통 모듈이 기존 클래스명을 탐색하여 점진적으로 같은 계약으로 정규화한다.

## 9. 독립성과 교체 가능성

Admin Shell은 특정 프레임워크나 클라우드에 종속되지 않는 브라우저 JavaScript 계약으로 유지한다. 서비스별 관리자 앱은 표준 데이터 계약만 유지하면 구현체를 교체할 수 있다.

## 10. 고객사이트 권한 투영

고객사이트 관리자 UI는 역할별 페이지 복제가 아니라 동일한 Admin Shell 안의 Capability 투영으로 운영한다.

- 최고관리자 전용 고객사이트 페이지를 별도로 만들지 않는다.
- 동일한 관리자 URL에서 로그인한 tenant-local role에 따라 메뉴와 작업영역이 달라진다.
- 숨겨진 메뉴를 직접 URL로 열어도 Capability 검증을 다시 수행한다.
- 플랫폼 관리자의 권한은 고객사이트 문맥에 자동 합성하지 않는다.
- 상세 기준은 `docs/customer-site-admin-constitution.md`를 따른다.
