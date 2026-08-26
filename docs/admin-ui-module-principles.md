# EKODI 관리자 UI Shell 원칙

상태: 표준
버전: v1
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

## 3. 좌측 내비게이션

- 좌측 메뉴는 독립적으로 세로 스크롤한다.
- 본문 영역의 스크롤과 메뉴 스크롤은 서로 영향을 주지 않는다.
- 메뉴 구조와 그룹은 각 관리자 서비스의 기능에 맞게 유지할 수 있다.
- 공통 Shell은 메뉴의 위치·스크롤 계약만 책임지고 메뉴 내용을 소유하지 않는다.

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
2. 좌측 메뉴 독립 스크롤
3. 관리자 작업영역 독립 스크롤
4. 계정/로그아웃 하단 배치
5. 사용자 Shell과 관리자 Shell의 분리

## 8. 표준 마크업 계약

신규 관리자 화면은 가능하면 명시적 데이터 속성을 사용한다.

```html
<aside data-ekodi-admin-sidebar>
  <nav data-ekodi-admin-nav>...</nav>
  <div data-ekodi-admin-sidebar-footer>
    <div data-ekodi-account>...</div>
    <button data-ekodi-logout>로그아웃</button>
  </div>
</aside>
<main data-ekodi-admin-main>...</main>
```

레거시 관리자 화면은 공통 모듈이 기존 클래스명을 탐색하여 점진적으로 같은 계약으로 정규화한다.

## 9. 독립성과 교체 가능성

Admin Shell은 특정 프레임워크나 클라우드에 종속되지 않는 브라우저 JavaScript 계약으로 유지한다. 서비스별 관리자 앱은 표준 데이터 계약만 유지하면 구현체를 교체할 수 있다.
