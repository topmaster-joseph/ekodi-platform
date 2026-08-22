# EKODI UI Classification

## USER UI
- My EKODI
- 일반 사용자용 EKODI 서비스 화면
- 중심 AI: EKODI User AI / 개인 AI 비서
- 목적: 개인 상태 이해, 맞춤 제안, 서비스 이동, 개인 활동 지속

## ADMIN UI
- EKODI Admin
- 점포·기관·서비스 운영 화면
- 중심 AI: EKODI Admin AI / 운영 AI 직원
- 목적: 운영 상태 파악, 승인, 처리, 분석, 오류 대응

## COMMON FOUNDATION
- EKODI Core
- 에코디 생태계 공통 기반·연결 코어
- Identity/Auth, Workspace, Role/Permission, Event, Notification, Service Registry, Audit Log, AI Gateway

## Governance Rule
사용자 화면과 관리자 화면은 같은 디자인 토큰과 Core를 공유할 수 있지만 정보 밀도, 메뉴 구조, 권한, AI 역할은 분리한다. User AI와 Admin AI는 서로를 직접 호출하는 상하 구조가 아니라 EKODI Core를 통해 연결되는 병렬 역할 계층으로 관리한다.
