# My EKODI AI System

## EKODI User AI
개인 AI 비서

My EKODI의 중심 AI 역할. 사용자의 개인 컨텍스트를 읽고 다음 행동을 제안한다. 직접 모든 전문 AI를 지휘하지 않으며, 필요한 경우 해당 서비스로 이동을 안내한다.

## EKODI Admin AI
운영 AI 직원

관리자 화면에서 운영 상태를 읽고 업무를 제안·보조한다. User AI와 역할과 권한을 분리한다.

## EKODI Core
에코디 생태계 공통 기반·연결 코어

Identity/Auth, Workspace, Role/Permission, Event, Notification, Service Registry, Audit Log, AI Gateway를 공통으로 제공한다.

## My EKODI UX Rules
- USER UI로 분류한다.
- 첫 화면은 EKODI User AI의 오늘의 제안을 가장 먼저 보여준다.
- 시스템 카운터는 제안과 현재 공간 다음에 배치한다.
- Workspace 선택은 화면에 하나만 보이게 한다.
- 모바일 최상단 헤더는 safe-area를 반영해 고정한다.
- 개인비서는 전문 AI를 직접 호출하거나 지휘하지 않고 서비스 handoff만 수행한다.
- 특정 AI 공급자가 없어도 규칙 기반 제안은 동작한다.
