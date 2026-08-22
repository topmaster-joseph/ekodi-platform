# AI Role Matrix

| Layer | Official name | Korean role | Scope |
|---|---|---|---|
| USER UI | EKODI User AI | 개인 AI 비서 | 개인 컨텍스트, 맞춤 제안, 서비스 handoff |
| ADMIN UI | EKODI Admin AI | 운영 AI 직원 | 운영 상태, 업무 제안, 관리자 보조 |
| Core | EKODI Core | 에코디 생태계 공통 기반·연결 코어 | 인증, Workspace, 권한, 이벤트, 알림, 서비스 레지스트리, 감사, AI Gateway |

## Fixed boundary
- EKODI User AI는 전문 AI를 직접 지휘하지 않는다.
- EKODI Admin AI는 관리자 권한 안에서만 운영 보조를 수행한다.
- 둘은 상하관계가 아니라 EKODI Core 위의 병렬 역할 계층이다.
- 특정 AI 공급자가 없어도 핵심 서비스와 규칙 기반 제안은 유지한다.
