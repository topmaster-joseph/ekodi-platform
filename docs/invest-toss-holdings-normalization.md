# EKODI Invest — 토스증권 조회 데이터 검증 1단계

공식 기준: 토스증권 OpenAPI v1.2.14, `https://developers.tossinvest.com/docs`, 기계 판독 원문 `https://openapi.tossinvest.com/openapi-docs/latest/openapi.json` (2026-11-03 확인).

## 범위

`invest-toss-holdings-normalizer.js`는 토스증권 공식 `GET /api/v1/holdings` 응답 형식을 **외부 전송 없이** 변환·검증하는 순수 모듈이다.

- 공식 응답의 `result.items[].{symbol,name,marketCountry,currency,quantity,marketValue.amount}`와 `result.marketValue.amount.{krw,usd}` 값을 사용한다.
- KRW와 USD를 서로 합산하지 않는다. 외화 환산과 예수금·미체결 주문·실제 총계좌자산을 추정하지 않는다.
- 화폐는 문자열에서 정수 minor unit(100분의 1)으로 변환한다. 지수 표기·음수·소수점 2자리 초과·중복종목·보유 평가액 총계 불일치를 거부한다.
- KR 주식은 KRW, US 주식은 USD 평가액을 요구한다. `usd:null`은 미 보유 상태에서만 수용한다.
- 응답에 들어온 계좌번호·토큰·비밀키·임의 필드는 결과에 전파하지 않는다. 종목명은 80자 이하로 제한하고, 결과에는 계좌 식별자가 없다.
- 입력 형식 검증이 통과해도 `sourceAuthenticated:false`, `ownerBindingVerified:false`, `accountConnected:false`, `readOnlyConnectionVerified:false`, `networkCallPerformed:false`, `liveOrdersEnabled:false`다.

## API 연결 준비 — 아직 미실행

토스증권은 공식 문서에 따라 WTS에서 Open API 신청 및 client_id/secret 발급, 서버 출구 IP 등록, OAuth2 `POST /oauth2/token`, 계좌 조회 시 `X-Tossinvest-Account` 헤더가 필요하다. 이를 실제 연결하기 전에 최고관리자 본인 계좌·정책 동의·서버 Vault·암호화 토큰 캐시·토큰 발급 횟수 제한·MFA(AAL2)를 검증해야 한다.

보유종목 API 자체에는 현금 잔고가 포함되지 않으므로, 별도 허용된 공식 조회 API를 검증하지 않고 예수금·순자산을 생성하지 말 것. 장내 호가/시세와 계좌 보유 평가액의 갱신 시각도 분리해야 한다.

이 단계는 **API 요청, 인증키 등록, 주문·정정·취소, 실제 자금 이동을 수행하지 않는다.** 기존 KIS 기본값, 토스증권 선택·개인 서버 저장, KIS 모의·실전 조회, 실거래 HTTP 423 잠금은 모두 유지된다.

검증: `node --test test/invest-toss-holdings-normalizer.test.mjs`, 이후 전체 CI·공식 복구 PR·보호 병합. 실제 계좌 연결은 별도 승인 및 운영 세션·스테이징·프로덕션 검증 후 진행.
