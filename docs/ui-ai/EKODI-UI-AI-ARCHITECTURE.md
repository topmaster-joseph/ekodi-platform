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

## AI Responsibility Boundary

### EKODI User AI
- My EKODI를 중심으로 개인 컨텍스트를 해석한다.
- 일정, 최근 활동, 미완료 작업, 연결된 Workspace, 사용 패턴에 따라 다음 행동을 제안한다.
- 전문 AI를 직접 지휘하거나 모든 실행을 중앙집중화하지 않는다.
- 필요 시 사용자를 해당 EKODI 서비스로 안전하게 handoff한다.
- 특정 AI 공급자가 없어도 기본 상태 요약과 규칙 기반 제안은 유지한다.

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

Workspace 선택 UI는 한 화면에서 하나만 노출하고, 모바일 최상단 헤더는 safe-area를 반영해 고정한다.

## One-line Principle
**EKODI User AI는 개인을 돕고, EKODI Admin AI는 운영을 돕고, EKODI Core는 둘을 안전하게 연결한다.**
