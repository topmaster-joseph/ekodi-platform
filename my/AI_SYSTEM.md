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
- 첫 화면의 중심은 시스템 숫자가 아니라 개인비서의 제안이다.
- Workspace 선택은 한 화면에서 중복 노출하지 않는다.
- 개인비서 제안은 규칙 기반·상태 기반으로도 동작해야 한다.
- 특정 AI 공급자가 없어도 기본 홈과 제안 기능은 유지한다.
- 중요한 실행은 사용자가 최종 선택한다.
