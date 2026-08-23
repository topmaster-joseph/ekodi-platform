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

## Automatic Multi-AI Access Policy

EKODI는 사용자에게 공급자 선택과 API 구조를 떠넘기지 않는다. 기본값은 자동 라우팅이며, 사용자는 질문하기 전에 AI 방식을 이해할 필요가 없다.

### Core first

모든 요청은 먼저 EKODI Core의 규칙·상태·공식 데이터로 처리 가능한지 판단한다. AI가 불필요하면 모델 호출 없이 끝낸다.

### Foreground / interactive

사용자가 화면에서 직접 AI 도움을 받는 경우:

- Free/Flex는 EKODI 유료 API 지원량이 0이며 개인 AI 비용 경로를 우선한다.
- 안전하게 연결된 개인 API가 있으면 먼저 사용한다.
- 유료회원은 개인 API가 없을 때 화면 이탈을 줄이기 위해 회원등급의 EKODI 지원 API를 자동 사용할 수 있다.
- 사용자가 `개인 AI 우선`을 명시한 경우에는 ChatGPT·Gemini 같은 개인 AI 웹 접근을 EKODI 지원 API보다 먼저 제시한다.
- 최종적으로 사용할 AI가 없으면 Core-only로 유지한다.

기본 자동 순서:

`Core → 개인 API → 회원등급 EKODI 지원 API → 개인 AI 웹 → Core-only`

Free/Flex에서는 지원 API가 0이므로 실제 순서는:

`Core → 개인 API → 개인 AI 웹 → Core-only`

### Proactive / unattended

EKODI가 사용자의 질문을 기다리지 않고 일정, 이벤트, 상태 변화를 감지해 먼저 준비하는 경우에는 소비자 AI 웹 세션을 사용할 수 없다.

`Core → 개인 서버 API → 회원등급 EKODI 지원 API → Core-only`

- ChatGPT/Gemini 웹 로그인 상태를 자동화에 재사용하지 않는다.
- 개인 서버 API가 안전하게 연결되어 있으면 먼저 사용한다.
- 없으면 허용된 회원등급 지원량 안에서만 EKODI API를 사용한다.
- 둘 다 없으면 AI 없이 Core 규칙으로 계속 동작한다.

### Admin / system

관리자와 시스템 자동 실행은 감사·권한·보안·재현성이 필요하므로 서버에서 호출 가능한 API만 사용한다. 개인 ChatGPT/Gemini 웹 세션을 관리 자동화의 실행 통로로 사용하지 않는다.

현재 Admin AI의 Core AI Gateway 방식은 이 원칙과 일치한다. 향후 관리자 개인 API를 연결하더라도 서버 암호화 저장소와 명시된 권한 범위 안에서만 사용한다.

## Personal-first Multi-AI Cost Policy

- Free 회원의 기본 원칙은 `개인 AI 우선 + EKODI 유료 API 비용 0원`이다.
- Free/Flex 요청은 EKODI의 OpenAI API로 자동 전환하지 않는다.
- 사용자는 ChatGPT·Gemini 같은 개인 AI 웹 환경에서 자신의 무료/유료 사용권을 사용할 수 있다.
- Gemini처럼 사용자 소유 API를 연결할 수 있는 공급자는 개인 API 경로를 제공한다. 개인 API 사용료와 무료 한도는 공급자와 사용자 계정에 귀속된다.
- 개인 API 비밀키는 브라우저 저장소에 보관하지 않는다. 서버 전용 암호화 저장소를 통해서만 연결한다.
- 유료 EKODI 회원은 서비스별 회원등급에 따라 제한된 EKODI 지원 AI 사용량을 받을 수 있다.
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
- 기본 화면에서 Provider, API, 모델 같은 기술 용어를 강요하지 않는다.
- 고급 설정에서만 개인 AI 연결과 우선순위를 노출한다.
- AI 비용 출처와 사용 주체는 필요할 때 확인 가능하게 하되 일상 흐름을 방해하지 않는다.
- 개인 AI 키를 클라이언트 코드, localStorage, 로그 또는 분석 이벤트에 저장하지 않는다.
