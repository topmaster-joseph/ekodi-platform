# EKODI AI Private Wealth — 자율투자 운영실 (P0–P3)

Task: `invest-autonomous-wealth-p0p3` · Branch: `ai/claude/invest-autonomous-wealth-p0p3` · 정식 주소: `https://ekodi.kr/my/invest`

## 범위와 원칙

- 최고관리자 본인 명의·자기자금만 대상. 타인 자금, 투자일임, 유료 자문, 외부 회원 자동투자는 제공하지 않습니다.
- 기본 상태는 `RESEARCH_ONLY`. 이 변경으로 **실제 주문은 어떤 경로로도 제출되지 않습니다**.
  `invest-market-core.js`의 `INVEST_MARKET_POLICY.autonomousLiveTrading=false`가 최종 잠금이며, 이를 해제하는 것은 별도의 거버넌스 릴리스입니다.
- 수익 엔진(전략 신호)과 위험 엔진(Risk Engine)은 분리되어 있습니다. 전략 코드는 Risk Engine을 우회할 수 없습니다.
- 금액·손실 한도의 초기값은 모두 미설정(`null`)입니다. 60/25/15 자산배분은 화면에 보여주는 예시일 뿐 자동 적용되지 않습니다.

## 구성

| 파일 | 역할 |
|---|---|
| `invest-autopilot-core.js` | 순수 결정론 모듈. 정책 검증, 운영 상태 머신, 실거래 게이트, 독립 Risk Engine, Sentinel, 모의 브로커, 장부 대조, 백테스트·워크포워드·스트레스, 전략 합격 기준, 보고서 |
| `invest-autopilot-runtime.js` | `/v1/invest/autopilot/*` API (workspace-platform 워커, D1 `ekodi-auth`). 본인(`INVEST_OWNER_EMAIL`) 전용 |
| `migrations/202610251300_invest_autopilot.sql` | `investment_autopilot_accounts` / `_orders` / `_events` (추가 전용, 인증정보 컬럼 없음) |
| `invest-my-workspace.js` | `/my/invest` 화면: 운용 상태 6지표, 긴급정지, 정책 설정, 실거래 남은 조건, 모의 주문, 판단 기록, 주간·월간 보고서 |

재사용: `invest-market-core.js`(브로커 레지스트리, `evaluateInvestmentOrder`를 Risk Engine 마지막 층으로 사용), `ekodi-principal.js`(Supabase 본인 확인·감사), 기존 `investment_policies` 킬스위치(긴급정지 시 `halt`로 동기화).

## API

| Method | Path | 설명 |
|---|---|---|
| GET | `/v1/invest/autopilot/status` | 상태·정책·미설정 항목·모의 장부·Sentinel·실거래 차단 사유·최근 주문/이벤트 |
| PUT | `/v1/invest/autopilot/policy` | 정책 저장. 레버리지 등 금지 항목, 한도 간 모순, 비용 미승인 문자 알림은 400 |
| POST | `/v1/invest/autopilot/state` | 상태 전환. 긴급정지 해제는 `confirm:"RESUME_AFTER_REVIEW"` 필요 |
| POST | `/v1/invest/autopilot/emergency-stop` | 신규 주문 중지, 미체결 모의 주문 취소. 보유자산 청산 없음 |
| POST | `/v1/invest/autopilot/disclosure` | 거래비용·위험 고지 확인 기록 |
| POST | `/v1/invest/autopilot/paper/orders` | Risk Engine 통과 시에만 모의 체결. 차단 건도 사유와 함께 기록 |
| GET | `/v1/invest/autopilot/report?kind=weekly\|monthly` | 주간·월간 보고서. 모르는 값은 "확인 필요"로 표시 |

## 운영 상태

`RESEARCH_ONLY → PAPER_TRADING → LIVE_PENDING_APPROVAL → LIVE_ACTIVE`, 언제든 `PAUSED` / `EMERGENCY_STOPPED`.

- `PAPER_TRADING`: 정책 전 항목 설정 + 위험 엔진 정상.
- `LIVE_PENDING_APPROVAL`: 모의투자 검증 통과(최소 60일, Sentinel 위반 0건, 전략 합격 기록). 현재는 전략 합격 기록이 연결되지 않아 **도달 불가**.
- `LIVE_ACTIVE`: 10개 게이트 전부 필요(계좌 본인 인증, 증권사 자동매매 조건 확인, 주문 API 실검증, 정책, 모의 검증, 비용·위험 고지, 별도 명시적 승인, 정책 지문이 일치하는 서버 승인 기록, 위험 엔진 정상, 플랫폼 잠금 해제).
- 운용금 증액, 시장·자산 확대, 손실·집중 한도 상향, 투자 성향 변경은 기존 승인을 무효화합니다.

## Risk Engine 검사 항목

운용 상태, 정책 완결성, 지정가만 허용, 신용·미수·레버리지·파생 차단, 주문 식별자·중복, 허용 시장·자산, 증권사 장애, 장부 불일치, 미확인 주문 존재, 시세 지연(15초), 지정가 괴리(3%), 일중 급변(30%), 거래정지, 허용 시간대·주말, 일일 거래 횟수, 1회 주문한도(수수료·슬리피지 포함), 일일 매수한도, 총 운용한도(보유+미체결+예약), 최소 현금비중, 가용 현금, 종목 비중, 보유종목 수, 일일·누적 손실 한도, 보유수량 초과 매도.

## 토스증권 Open API 확인 결과 (공식 문서, 2026-10-25)

출처: `developers.tossinvest.com/llms.txt`, `openapi.tossinvest.com/openapi-docs/{overview.md,faq.md,latest/openapi.json v1.2.24,latest/asyncapi.json}`, `home.tossinvest.com/ko/open-api`.

- 개인 계좌로 발급 가능(WTS → 설정 > Open API에서 `client_id`·`client_secret` 발급, 허용 IP 등록). 별도 심사 절차는 문서에 없음.
- 국내·미국 주식 지원. ETF 주문 가능 여부를 명시한 문장은 없음(확인 필요).
- REST: `POST /oauth2/token`(client credentials, 24시간, refresh token 없음, client당 유효 토큰 1개), `GET /api/v1/accounts`, `/api/v1/holdings`(`averagePurchasePrice`), `/api/v1/buying-power`, `POST /api/v1/orders`, `/orders/{orderId}/modify`, `/orders/{orderId}/cancel`, `GET /api/v1/orders`, `/api/v1/commissions`. 계좌·주문 API는 `X-Tossinvest-Account` 헤더 필요.
- WebSocket `wss://openapi-ws.tossinvest.com/ws/v1`: 계정당 2연결, 연결당 100구독. 시세 채널은 유실 가능(LOSSY), 주문 채널은 무손실.
- 호출 한도 예: ORDER 10/s, ACCOUNT 1/s, MARKET_DATA 15/s.
- **공식 모의투자 환경 없음** → EKODI 자체 Paper Engine 사용(구현 완료).
- 이용 조건: "본인의 매매 목적으로만" 이용, 단시간 대량 주문 시 매매 제한 가능. 약관 원문은 로그인이 필요해 확인하지 못함.
- 실시간 시세 이용료·API 비용: 문서에 언급 없음(확인 필요).
- **아키텍처 제약**: 허용 IP 등록이 필수인데 Cloudflare Workers에는 고정 출구 IP가 없습니다. 조회 어댑터를 연결하려면 고정 IP 중계(비용 발생 가능)가 필요하며, 이는 사용자 승인 사항입니다.
- 홈페이지 예시의 `BASE=".../v1"` 경로는 공식 명세(`/api/v1/...`)와 다릅니다. 명세를 기준으로 합니다.
- 한국투자증권 KIS: 공식 모의투자 도메인 `openapivts.koreainvestment.com:29443`(공식 GitHub 설정 기준). 검증용 대체 어댑터 후보입니다.

## 검증 상태

| 항목 | 상태 |
|---|---|
| 단위 테스트 (core 12, runtime 7, UI 3) | 통과 |
| 기존 invest·my 테스트 | 통과 (`invest-admin-lazy-render` 1건은 main에서도 실패, 기존 결함) |
| 전체 `npm test` | main과 실패 목록 동일(72건, 모두 기존 결함), 신규 회귀 없음 |
| 저장소 검증기 (boundaries, deployments, security, orchestration, ui-surfaces, user-surfaces, claim-integrity, mission, constitution, additive migrations) | 통과 |
| 로컬 화면 (실제 페이지·API, 메모리 D1) 데스크톱 1440px | 확인 |
| 모바일 390px 실기기 | **확인 필요** (headless Chrome 최소 폭 제약으로 미검증) |
| 스테이징·운영 배포, 운영 D1 마이그레이션 | **미실행** (오케스트레이터 릴리스 대상) |
| 실제 과거 시세 기반 백테스트·표본 외 검증 | **미실행** (검증된 데이터 소스 미연결, 합성 국면 스트레스만 수행) |
| 토스 실제 API 응답 검증 | **미실행** (사용자 발급 키·고정 IP 필요) |

## 사용자 승인·인증이 필요한 항목

1. 토스증권 Open API 키 발급(본인 WTS)과 서버 비밀 저장소 등록. 키는 브라우저나 AI 제공자에게 전달하지 않습니다.
2. 고정 출구 IP 중계 도입 여부와 비용.
3. 시세 데이터(과거·실시간) 소스 선택과 비용.
4. 문자(SMS) 위험 알림의 비용 승인.
5. 실거래 활성화: 모의투자 60일 이상 + 전략 합격 + 위 1~4 완료 후 별도 화면에서 명시적 승인. 이 문서나 기존 구축 승인은 실거래 승인이 아닙니다.

## P4 자동 운영 (정기 감시·보고)

- 실행 위치: 기존 Control API 10분 크론(`mission-control-entry-worker.js` `scheduled`)에 `runInvestAutopilotSchedule`을 추가했습니다. workspace-platform 워커는 크론 슬롯을 새로 쓰지 않는다는 기존 계약을 유지합니다. 같은 D1(`ekodi-auth`)을 사용합니다.
- 매 실행: 모의투자 중인 계정마다 Sentinel 검사(손실 한도 도달 시 자동 `PAUSED`, 보유자산 유지) → 한국시간 일별 평가자산 기록(`investment_autopilot_equity_daily`).
- 긴급 알림: critical 경보는 `investment_autopilot_notices`에 코드·날짜별 1건만 생성됩니다(10분마다 반복 발송 없음).
- 정기 보고서: 주간(월요일 08:00 KST, 직전 월~일), 월간(1일 08:00 KST, 직전 달). `(kind, period_key)` 고유키로 중복 실행에도 1회만 생성됩니다. 기간 수익률·최대낙폭은 일별 평가자산으로 계산하고, 측정할 수 없는 값은 "확인 필요"로 둡니다.
- 전달: 항상 `/my/invest` 상단 "이번 주 핵심 요약"·"중요 위험 알림"에 표시합니다. 정책에서 이메일을 선택했고 기존 메신저 이메일 채널(`CHANNEL_EMAIL` 바인딩 또는 `CHANNEL_EMAIL_URL`)과 `INVEST_OWNER_MESSENGER_THREAD_ID`가 설정된 경우에만 이메일로도 보냅니다. 현재 운영 설정 여부는 확인하지 못했습니다(확인 필요). 새 유료 채널은 추가하지 않았습니다.
- 사용하지 않은 경로: 플랫폼 운영 보고서(`ekodi_owner_reports`)는 투자정보 분리 원칙 때문에, GitHub 이슈 알림은 저장소가 공개 저장소라서 사용하지 않습니다.
- 한계: 시세가 직접 입력값이라 Sentinel은 마지막 입력 시세 기준으로만 판단합니다. 실시간 시세 연결 전에는 장중 급락을 감지하지 못합니다.

## 다음 단계

- P1: 토스 조회 전용 어댑터(`/api/v1/holdings`, `/accounts`), 서버 측 토큰 캐시(24h, 단일 토큰), `X-RateLimit-*` 준수. 고정 IP 중계 승인 후(보류 중).
- P2: 검증된 과거 시세로 워크포워드·스트레스 실행, 결과를 전략 합격 기록으로 저장(`paperValidation`의 마지막 차단 사유 해제).
- 거버넌스: 모의 자율운용 기능 추가가 `invest` 공통서비스 헌장 개정(C2/C3) 대상인지 오케스트레이터 판정 필요.
