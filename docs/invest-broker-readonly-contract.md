# EKODI Invest: 증권사 조회 전용 네트워크 경계 (설계·테스트 단계)

## 적용 범위
- `/my/invest` 최고관리자 본인 자금에 한정한다. EKODI Orchestrator와 보호된 PR/배포 절차가 유일한 릴리스 경로다.
- `invest-broker-readonly-contract.js`는 **부작용 없는 정책 카탈로그 및 사전 검증** 모듈이다. 현재 실제 브로커 통신·로그인·토큰 발급·잔고 수집·실주문은 구현하지 않는다.
- `READONLY_BROKER_TARGETS`: KIS REST 실전 `https://openapi.koreainvestment.com:9443`, 모의 `https://openapivts.koreainvestment.com:29443`; 토스증권 REST `https://openapi.tossinvest.com`. 각 API의 GET 조회 목적지만 허용한다. Interactive Brokers는 공식 인증 세션 검증 전까지 등록 대상이더라도 조회 전송 대상에서 제외한다.
- `resolveBrokerReadOnlyTarget`은 고정된 브로커+환경+기능만 받아 표준 GET 목적지를 결정한다. 호출자가 지정하는 URL·경로·쿼리·헤더·본문·비밀키 등은 모두 거부한다. `checkBrokerReadOnlyRequest`는 요청 목적지와 고정 GET 경로의 **정확한 일치**만 검증한다. KIS의 실제 계좌 조회는 필수 GET 쿼리를 가진 별도 **서버 전용 조립기**가 필요하므로 현재 조회 전송을 시도하지 않는다.
- `evaluateBrokerReadOnlyPrerequisites`은 서버가 실제 확인한 최고관리자 신원, OTP AAL2, 기존 step-up, 자기명의 계좌, 공식 read scope·동의, Vault 준비, 증권사 허용 출구 IP를 **모두** 충족해야 다음 구현 단계 후보로 표시한다. 이 판정은 신원/증빙을 독자적으로 인증하지 않으며, 입력된 플래그는 신뢰된 서버 구성요소에서 검증된 경우에만 사용할 수 있다. 준비 통과 후에도 `connected:false`, `readOnlyConnectionVerified:false`, `networkCallPerformed:false`, `liveOrdersEnabled:false`를 유지한다.

## 현재 확인된 공식 문서
- KIS Developers API: https://apiportal.koreainvestment.com/apiservice-summary
- KIS 공식 Python 국내주식 잔고조회 예제: https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_balance/inquire_balance.py
- Toss Securities Open API: https://developers.tossinvest.com/docs (계좌 `GET /api/v1/accounts`, 보유 `GET /api/v1/holdings`, 주문 조회 `GET /api/v1/orders`와 주문 생성 `POST /api/v1/orders`를 엄격히 분리)

## 다음 통합 단계 (현재 미완료)
1. #6923 (KIS 카탈로그 UI/서버 MFA 차단) 공식 HEAD의 GitHub 유지관리자 검사 승인과 protected merge, staging/canary/운영 실증.
2. 본인 계좌 공식 서비스 신청·증권사 약관 동의·API 키 발급과 서버 Vault 등록. 키/계좌번호/OTP QR/실제 토큰은 공개 저장소·클라이언트·ChatGPT에 노출 금지.
3. 허용 egress IP를 고정한 별도 호출 경계, 인증·시세·잔고·미체결내역 조회, 키 순환, 감사 로그 및 조회 제한 구현. 브로커 계좌의 실제 데이터·권한을 서버에서 교차 검증한 뒤에만 `readOnlyConnectionVerified` 승격.
4. 실전/모의 인증정보 및 계좌·환경 절대 혼합 금지; 자동 재시도는 API의 중복 처리·rate-limit에 안전한 조회에만 사용.
5. 독립된 60일 모의 검증, 금액/종목/시간/손실/철회 정책, 주문별 명시 승인과 독립적 실거래 release 이전에는 `POST /live/orders` HTTP 423, 전역·브로커 `liveTradingEnabled:false` 유지.

본 계약은 **증권사 연결 및 거래의 실증 결과가 아니다.** 실제로 연결됐다는 UI나 보고를 생성해서는 안 된다.
