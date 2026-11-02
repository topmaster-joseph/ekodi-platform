# ekodi-church-homepage
에코디교회 공식 홈페이지 · Cloudflare Pages 운영 기준

## 온라인 헌금
- 계좌이체는 홈페이지에서 공식 계좌를 직접 확인한 뒤 이용합니다.
- 카드·자동이체는 에코디교회가 카드정보를 직접 받지 않고 MissionFund의 보안 후원창으로 연결합니다.
- 확인된 교회 후원 프로젝트는 `https://go.missionfund.org/fmd01` 입니다.
- MissionFund 결제망의 카드 처리는 NICE Payments, 계좌 자동이체는 금융결제원 CMS 경로를 사용합니다.
- Toss 전용 SDK·운영키·직접 승인 API 의존성은 사용하지 않습니다.

## 운영 원칙
- 결제 제공사는 교체 가능한 어댑터로 취급하고 교회 페이지에는 결제 비밀키를 저장하지 않습니다.
- 교회와 선교회 회계 주체 및 계좌는 화면에서 명확히 구분합니다.
- 확인되지 않은 별도 가맹점이나 프로젝트를 추정 연결하지 않습니다.
- `npm test`로 후원 경로, 보안 헤더, Toss 잔존 의존성을 검증합니다.


## Surface ownership
- 공개 사용자 화면: `https://ekodi.kr/ekodichurch/`
- 교회 사용자 마이페이지: `https://ekodi.kr/ekodichurch/my` — EKODI 공통 Identity와 Capability Registry를 사용하되 교회 문맥에서 표시합니다.
- 교회 관리자 화면: `https://ekodi.kr/ekodichurch/admin` — `ekodi-platform`의 Church Pastor Admin이 소유하며 이 정적 공개 저장소에 중복 구현하지 않습니다.
- 로그인 후 기본 복귀점은 공용 My EKODI가 아니라 교회 로컬 마이페이지입니다.
- 교인·돌봄·권한·사역 관리 데이터는 공개 화면에 포함하지 않고 관리자/Workspace 권한 경계 안에서만 처리합니다.
