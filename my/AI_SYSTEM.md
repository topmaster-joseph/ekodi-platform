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

## Personal-first Multi-AI Policy

EKODI는 AI 공급자 또는 AI 비용에 사용자를 종속시키지 않는다.

- Free 회원의 기본 원칙은 `개인 AI 우선 + EKODI 유료 API 비용 0원`이다.
- Free/Flex 요청은 EKODI의 OpenAI API로 자동 전환하지 않는다.
- 사용자는 ChatGPT·Gemini 같은 개인 AI 웹 환경으로 전환해서 자신의 무료/유료 사용권을 사용할 수 있다.
- Gemini처럼 사용자 소유 API를 연결할 수 있는 공급자는 개인 API 경로를 제공한다. 개인 API 사용료와 무료 한도는 공급자와 사용자 계정에 귀속된다.
- 개인 API 비밀키는 브라우저 저장소에 보관하지 않는다. 서버 전용 암호화 저장소를 통해서만 연결한다.
- 유료 EKODI 회원은 서비스별 회원등급에 따라 제한된 EKODI 지원 AI 사용량을 받을 수 있다.
- 기본 라우팅은 `개인 API → 회원등급 EKODI 지원 AI → 개인 AI 웹 → Core-only`이며 사용자가 우선순위를 변경하거나 AI를 끌 수 있다.
- 비밀번호, API 키, 토큰, 주민등록번호, 카드·계좌 정보 등 민감정보는 개인 무료 API로 자동 전송하지 않는다.
- 개인 AI 장애, 지원량 소진, AI 공급자 장애가 발생해도 EKODI Core와 기본 서비스는 계속 동작한다.
- AI 사용 기록은 `personal`과 `ekodi` funding으로 분리해 EKODI 비용과 사용자 비용을 혼합하지 않는다.

### Initial sponsored request caps

초기 안전 상한은 월 요청 수 기준이며 운영 환경 변수로 코드 배포 없이 조정할 수 있다.

| Plan | EKODI-sponsored AI / month |
| --- | ---: |
| Free | 0 |
| Flex | 0 |
| Basic | 25 |
| Plus | 100 |
| Pro | 500 |
| Auto | 1,500 |

실제 상품화 전에는 요청 수뿐 아니라 모델별 원가, 토큰 비용, 기능 가치와 abuse 지표를 함께 사용해 예산 정책을 고도화한다.

## My EKODI UX Rules

- USER UI로 분류한다.
- 첫 화면의 중심은 시스템 숫자가 아니라 개인비서의 제안이다.
- Workspace 선택은 한 화면에서 중복 노출하지 않는다.
- 개인비서 제안은 규칙 기반·상태 기반으로도 동작해야 한다.
- 특정 AI 공급자가 없어도 기본 홈과 제안 기능은 유지한다.
- 중요한 실행은 사용자가 최종 선택한다.
- AI 비용 출처와 사용 주체를 사용자 화면에서 명확히 표시한다.
- 개인 AI 키를 클라이언트 코드, localStorage, 로그 또는 분석 이벤트에 저장하지 않는다.
