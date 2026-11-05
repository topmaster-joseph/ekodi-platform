# 에코디몰 비회원 결제·회원 1% 포인트 — 운영 계약 (2026-11-05)

## 판매 경로를 구분한다
- **에코디몰 직접결제**: `ekodi-mall-api` D1에 게시된 실제 직접판매 상품 + 확인된 가격/재고 + 검증된 에코디비즈 판매주체 + 토스 MID 게이트가 모두 충족된 상품. 회원/비회원 모두 로그인 강제 없이 토스 결제 가능.
- **쿠팡추천몰**: `/ekodimall/coupang/` 실제 표시가와 구매 페이지가 존재하지만 **쿠팡 판매처에서** 주문·결제된다. 에코디몰 D1 `/api/public/products`의 0건 조회 결과로 쿠팡상품이 없다고 결론내리면 안 된다.
- **여행·레저/전자책/기타 제휴**: 판매처·권리자·결제주체가 다르다. 에코디 서버에서 결제 완료를 입증하지 못하는 외부 결제는 1% 포인트 적립대상으로 확정하지 않는다.

## 회원 1% 정책
- 로그인하지 않아도 직접판매 주문·카드결제 가능. 비회원 구매는 포인트 없음. 고객이 임의 이메일·전화번호·회원번호를 입력한다고 회원 포인트를 부여하지 않는다.
- 로그인 회원은 중앙 Supabase Auth 세션의 유효한 JWT를 주문 API에 보낼 수 있다. Mall 서버는 `/auth/v1/user`로 토큰을 독립 검증하고 익명 사용자·이메일/전화 미인증 사용자를 제외한다. 브라우저 JSON의 `member` 필드는 절대 신뢰하지 않는다.
- **1%=100원당 1P, 소수점 버림**. 서버가 확정한 원화 직접결제 금액(상품금액, 실제 확인된 전액)을 기준으로 한다. 외부 제휴 구매, 주문 생성, 결제 대기, 실패, 인위적 리허설에는 적립 없음.
- 토스 서버에서 `DONE` 결제를 확인한 뒤 **1건의 불변 적립 증빙**을 D1에 기록한다. 반복 웹훅/승인 중복에도 1회. 부분·전액 환불이 서버에서 확인되면 누적 환불금액에 맞추어 추가 불변 마이너스 보정 증빙을 남기며, 역전된(낮아진) 환불 총액은 무시한다.
- 주문당 최대 1개 회원이며 로그인 이후 이미 생성된 **비회원 주문을 소급 연결하지 않는다**. 다른 회원은 해당 주문의 증빙을 읽을 수 없다.

## 현재 포인트 가용성 — 꼭 구분
- 2026-11-05 운영 Supabase DB `renzehysxirjilvdxacv`: **`public.ekodi_point_sites`, `public.ekodi_point_wallets`, `public.ekodi_point_ledger` 부재**. 개발 프로젝트에만 해당 스키마가 있다.
- `MALL_MEMBER_POINT_EVIDENCE_ENABLED=true`는 구입 증빙/미래 확정액만 남긴다. **`MALL_MEMBER_POINT_CORE_ENABLED=false`**, `spendable=false`는 그대로 유지. 이 단계에서 1P도 실제 회원 지갑에 지급하거나 사용할 수 있다고 말하지 않는다.
- 중앙 원장 사용을 위해서는 별도 보호 마이그레이션/백업/승인/카나리 및 단일 canonical Person 연결 검증이 선행되어야 한다. 원장 준비 후 본 증빙을 회원 Person으로 매핑하고 환불 보정까지 재생하는 신뢰 서버 작업을 새 보호 릴리스로 진행한다. 소급 적립은 별도 정책 및 감사 기록 없이 자동 활성화하지 않는다.

## 보호 배포
- 이 변경은 기존 `ekodi-mall` D1 `0028_member_purchase_point_evidence.sql` 마이그레이션을 스테이징에 먼저 적용하고, 합성 주문·결제·환불 및 중복방지·크로스회원 읽기차단을 검사한다.
- 토스 실제 결제 승인·프로덕션 시험 주문·고객 연락처 사용 없음. 외부 공급처 PII 전송, 자동발주, 임의 실환불·정산실행 불변.
- protected main merge 뒤 운영 API/Pages 배포를 확인하고 `/ekodimall/api/api/public/health`의 `memberPurchasePoints` 상태와 첫화면 문구를 검증한다.

## 보호된 Orchestrator 공식 작업 브랜치 검증 근거
- Source PR #8335 (SHA `7c65c00118ec9456990790ec388caa9f56c12c78`) was automatically superseded **without merge** by EKODI Orchestrator recovery PR #8336 on `ai/chatgpt/orch_recovery_7c65c00118ec9456990790ec388caa9f`. This owner-authored documentation checkpoint reruns authentic PR workflow checks after bot-created `action_required` results; it does **not** bypass required CI, policy, review or production safeguards.
- Live canonical storefront and `/ekodimall/coupang/` inspected in Opera on 2026-11-05; Coupang-priced offers can be purchased on the **external merchant** site. An empty first-party D1 `/api/api/public/products` does not mean there are zero sellable items across the whole shopping ecosystem.
- Read-only Supabase catalog queries on both `renzehysxirjilvdxacv` (production) and `lxcxwbdwwojjkgybbqii` (development) confirmed no `ekodi_point_*` tables in production, while development has the wallet and append-only ledger. Therefore member 1% **evidence** is recorded with `spendable=false`, and the central points feature cannot be asserted complete.
- New isolated D1 `0028` migration precedes the worker deploy; synthetic scenario tests cover verified JWT ownership, anonymous checkout, service-only Toss `DONE`, idempotent duplicate capture, partial/full refunds and rehearsal bypass. No production live charge, seller payout, public PII disclosure or points wallet mutation.
