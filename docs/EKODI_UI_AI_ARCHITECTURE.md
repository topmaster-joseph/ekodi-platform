# EKODI UI & AI Architecture

## Official Naming

### EKODI User AI
개인 AI 비서

### EKODI Admin AI
운영 AI 직원

### EKODI Core
에코디 생태계 공통 기반·연결 코어

## UI System

- **USER UI**: 일반 사용자용 화면 체계. 사람 중심, 제안 중심, 서비스 이동 중심.
- **ADMIN UI**: 관리자·운영자용 화면 체계. 운영 상태, 승인, 업무 처리, 분석 중심.
- **Shared / Core UI**: 인증, Workspace, Role/Permission, 알림, 공통 디자인 토큰, 서비스 레지스트리 등 공통 기반.

## USER UI Centered Canvas Principle

모든 사용자페이지와 사용자용 하부서비스의 기본 화면 구성은 **하나의 중앙축을 공유하는 Centered Canvas**를 사용한다.

- 공개 사용자 화면과 로그인 사용자 Workspace 화면은 데스크톱·태블릿·모바일에서 화면 전체의 시각적 중심축을 일관되게 유지한다.
- 기본 사용자 콘텐츠 캔버스 최대 폭은 `1240px`이며, 실제 폭은 뷰포트에 맞춰 축소하고 좌우 여백은 항상 대칭으로 둔다.
- 헤더, 본문, 카드·그리드·폼 묶음, 푸터는 서로 다른 폭을 사용할 수 있어도 같은 중앙축을 공유한다.
- **중앙정렬은 화면 구성의 정렬 원칙이지 모든 글자를 `text-align:center`로 만드는 규칙이 아니다.** 긴 본문, 폼 라벨, 표, 목록처럼 읽기와 입력에 좌측 정렬이 유리한 요소는 각 서비스의 가독성 원칙을 유지한다.
- 배경색·히어로 배경·지도·영상처럼 전체 폭이 필요한 시각 요소는 full-bleed를 허용하되, 그 안의 읽기·입력·행동 콘텐츠는 다시 중앙 캔버스로 복귀한다.
- 임의의 `left`, 음수 마진, 고정 픽셀 오프셋으로 화면 중심을 맞추지 않는다. 공통 캔버스와 `margin-inline:auto`를 사용한다.
- 사용자 화면의 첫 주 콘텐츠 루트는 의미론적 `<main>` 또는 `[role="main"]`을 사용하여 공통 User UI Shell이 중앙 캔버스를 자동 상속할 수 있게 한다.
- 이 원칙은 USER UI에 적용한다. ADMIN UI의 사이드바·운영 대시보드처럼 업무 밀도가 중요한 화면은 별도 관리자 레이아웃 원칙을 따른다.

공통 구현 기준은 `ekodi-shell-injector.js`의 `centered-v1` 사용자 레이아웃 표식과 `shell/user-ui-shell.css`의 공유 캔버스 규칙이다. 개별 하부서비스가 같은 기능을 중복 구현하지 않는다.

## AI Responsibility Boundary

### EKODI User AI
- My EKODI를 중심으로 개인 컨텍스트를 해석한다.
- 일정, 최근 활동, 미완료 작업, 연결된 Workspace, 사용 패턴에 따라 다음 행동을 제안한다.
- 전문 AI를 직접 지휘하거나 모든 실행을 중앙집중화하지 않는다.
- 필요 시 사용자를 해당 EKODI 서비스로 안전하게 handoff한다.
- AI가 없거나 특정 공급자가 장애여도 기본 상태 요약과 규칙 기반 제안은 유지한다.

### EKODI Admin AI
- ADMIN UI에서 운영자의 업무를 보조하는 AI 직원 역할을 한다.
- 미승인, 오류, 예약 실패, 운영 지표, 처리 대기 업무 등을 요약·제안한다.
- 관리자 권한과 Workspace 경계를 따르며 사용자 개인 데이터와 역할을 섞지 않는다.

### EKODI Core
- User AI와 Admin AI가 공통으로 사용하는 연결 기반이다.
- Identity/Auth, Workspace, Role/Permission, Event, Notification, Service Registry, Audit Log, AI Gateway를 공통 계층으로 제공한다.
- User AI와 Admin AI는 서로 직접 종속되지 않으며 Core를 통해 필요한 컨텍스트와 서비스를 연결한다.
- 특정 AI 공급자에 종속되지 않는 구조를 우선한다.

## My EKODI Product Principle

My EKODI는 단순 계정 페이지가 아니라 **EKODI User AI가 작동하는 개인 홈**이다.

우선순위:
1. 오늘의 제안
2. 이어서 할 일 / 미완료 작업
3. 현재 Workspace
4. 최근 활동과 알림
5. 내 서비스
6. 기본 정보와 연결 계정

Workspace 선택 UI는 한 화면에서 하나만 노출하는 것을 원칙으로 하며, 모바일에서는 현재 공간 카드 또는 바텀시트 방식으로 전환한다.

## One-line Principle

**EKODI User AI는 개인을 돕고, EKODI Admin AI는 운영을 돕고, EKODI Core는 둘을 안전하게 연결한다.**
