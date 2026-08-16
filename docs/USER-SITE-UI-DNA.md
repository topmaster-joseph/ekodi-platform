# EKODI User-Site UI DNA

## Purpose
EKODI의 사용자 사이트는 하나의 생태계라는 관계는 보여주되, 서로 같은 템플릿의 색상 변형처럼 보여서는 안 된다. 사용자는 첫 화면 3초 안에 `어느 서비스에 들어왔는지` 감각적으로 구분할 수 있어야 한다.

## Shared family traits
모든 사용자 사이트가 함께 유지할 것은 다음 다섯 가지뿐이다.

1. EKODI와의 관계를 알 수 있는 브랜드 표식과 `ekodi.kr` 복귀 경로
2. 접근성, 명확한 포커스 상태, 충분한 대비
3. 모바일 우선 반응형 동작
4. 사람이 최종 통제권을 갖는 명료한 인터랙션
5. 과도한 장식보다 내용과 행동이 먼저 보이는 구조

그 외 팔레트, 서체, 카드 모양, 여백, 정보밀도, 히어로, 모션은 서비스 성격에 맞게 적극적으로 달라져야 한다.

## Current and planned UI families

| Service | UI family | Visual direction | Density |
|---|---|---|---|
| Church | Sanctuary | 딥 포레스트, 크림, 절제된 금색, 큰 여백, 세리프 | Low |
| Community | Neighborhood Commons | 아이보리, 세이지, 부드러운 원형/칩, 사람 중심 카드 | Medium |
| Books | Academic Press | 종이색, 네이비, 버건디, 활자와 선 중심의 출판물 문법 | Medium-High |
| Author AI | Writing Lab | 니어블랙, 애시드 라임, 민트, 집중형 AI 스튜디오 | Medium-High |
| Lab | Field Research Journal | 따뜻한 종이, 그래파이트, 산화 오렌지, 데이터 블루, 근거/메모 문법 | Medium-High |
| Work | Precision Workbench | 슬레이트, 코발트, 격자 배경, 6~9px 각진 카드 | High |
| Social | Signal Stream | 미드나이트 네이비, 일렉트릭 스카이, 피드/채널 리듬 | High |
| Mall | Curated Market | 애프리콧, 코럴, 코발트, 마켓 옐로, 상품 타일/스티커 | Medium |
| Marketing AI | Campaign Studio | 오버진, 바이올렛, 웜 오렌지, 캠페인 캔버스와 전후 비교 | Medium-High |
| Biz | Business Briefing | 스톤, 차콜, 브라스, 경영 브리핑과 지표 밴드 | High |
| Trade | Global Terminal | 미드나이트, 시안, 아이스, 경로선/견적표/터미널 | High |
| Pay | Trust Ledger | 화이트, 잉크 네이비, 미세한 에메랄드, 최소한의 원장 문법 | Medium |
| Insurance | Protective Clarity | 소프트 스카이, 울트라마린, 웜화이트, 보장 레이어와 비교 스트립 | Medium |
| Education | Learning Studio | 초크, 울트라마린, 선플라워, 수업 블록과 진도 레일 | Medium |
| Media | Broadcast Stage | 니어블랙, 화이트, 시그널 레드, 16:9 영상 프레임과 굵은 헤드라인 | Medium |

`mission`은 별도 UI 계열을 만들지 않고 Community의 레거시 명칭/경로로만 취급한다.

## Collision rules
신규 또는 개편 UI는 다음을 통과해야 한다.

- 인접 서비스와 주조색이 같다면 타이포그래피, 카드 기하, 정보밀도 중 최소 2개가 뚜렷하게 달라야 한다.
- 주조색과 카드 모양이 모두 같으면 출시하지 않는다.
- 같은 히어로 레이아웃을 세 서비스 이상에서 반복하지 않는다.
- 둥근 흰색 카드 + 그린 포인트를 EKODI 기본값으로 사용하지 않는다.
- 다크모드는 서비스 성격에 필요한 경우에만 사용하며, 다크모드 자체를 차별화 수단으로 보지 않는다.
- 관리자/Control Center의 UI 문법을 일반 사용자 사이트로 복사하지 않는다.

## Change in this branch
- `work.ekodi.kr`: Community와 겹치던 크림/그린/둥근 카드 문법을 슬레이트/코발트 기반의 정밀 워크벤치로 분리.
- `mall.ekodi.kr`: Church/Community와 겹치던 그린/크림 중심에서 애프리콧/코럴/코발트/마켓 옐로 기반의 활기 있는 편집 마켓으로 분리.
- 기존에 이미 차별성이 큰 Church, Books, Author AI, Community, Social은 기능 안정성을 위해 이번 변경에서 억지로 재설계하지 않는다.
- Lab은 다음 안전한 소스 변경 시 Green-dominant에서 Field Research Journal 계열로 이동한다.

## Build rule for AI agents
새 플랫폼 생성 에이전트는 작업 시작 전에 `config/user-ui-dna.json`을 읽고 대상 서비스의 family를 적용한다. 등록되지 않은 서비스라면 기존 family를 복제하지 말고, 서비스 목적을 기준으로 새로운 family 후보를 만든 뒤 가장 가까운 두 기존 서비스와의 시각 충돌을 먼저 검사한다.
