# EKODI Pay 실제 결제 활성화 체크리스트

공식 주소: https://ekodi.kr/ekodipay/
초기 계약 법인/상점: EKODIBIZ (확정 필요). 다른 사업자는 별도 MID/정산 권한이 확인되기 전 실결제 금지.

## 현재 개발 범위
- /ekodipay/demo 는 항상 가상 주문, 실제 청구 0건입니다.
- /ekodipay/pay-now?orderId=... 는 내부 시스템에서 승인 및 등록한 불변 주문에만 허용됩니다.
- /ekodipay/api/merchant/orders 는 서버-서버 전용 내부 등록이며 32자 이상 무작위 Bearer 토큰을 요구합니다. 판매자, 승인 참조번호, 원화 정수 금액과 주문이 반드시 일치해야 합니다.
- /ekodipay/api/payments/confirm 은 PG SDK가 인증한 결과를 서버로 전달하며, 비공개 Durable Object 원장의 금액·주문번호를 확인하고 일회성 승인 잠금을 적용합니다. 승인 불명확 시 재결제 없이 정산 대조 대기로 남깁니다.
- /ekodipay/api/webhooks/toss 는 아직 503 차단입니다. PG 웹훅 URL로 **등록 금지**. 비동기 가상계좌 입금 기능은 웹훅 검증 전 활성화 금지.
- 취소/환불과 입금·정산: 안전한 운영 API와 보조 승인, PG 조회기능 추가 전까지 PG 관리자 콘솔에서 인가된 운영자가 처리하고 별도 대조를 해야 합니다.

## 실제 결제를 위해 필요한 외부 설정
1. 판매자가 될 법적 사업자, 토스페이먼츠 MID, PG 신청·심사 및 카드사/간편결제 승인, 고객센터 연락처, 개인정보 처리방침, 전자상거래 약관, 취소·환불 정책, 실제 정산계좌 예금주·사업자 일치 확인.
2. 각 판매자의 승인된 견적/주문을 확정하는 서버 서비스. 구매자 화면의 금액, 세액, 할인, 주문완료 플래그는 증거가 될 수 없습니다. 암호학적으로 예측 불가능한 고유 주문번호와 승인 번호를 만듭니다.
3. 토스페이먼츠 동일 MID의 v2 테스트 클라이언트키와 테스트 시크릿키, EKODIPAY 서버-서버용 무작위 토큰. **모두 Cloudflare 암호화 비밀값으로만 설정**. 채팅·PR·로그·파일·스크린샷에 시크릿키를 붙여넣지 마세요.
   Cloudflare 바인딩 이름: TOSS_TEST_CLIENT_KEY, TOSS_TEST_SECRET_KEY, EKODIPAY_SERVICE_ORDER_TOKEN. 테스트 단계 운영 변수 PAYMENT_EXECUTION_MODE=test 는 공식 검토·보호된 배포로만 변경.
4. 테스트: 실제 PG 테스트 MID로 카드·간편결제·계좌이체(계약 범위 내), 실패, 중복 승인, 금액 조작, 쿠키 만료, PC·모바일, 콜백/정산 대조, CSP, 결제 취소 및 롤백 검증.
5. 라이브 전 독립 검증: 판매 사업자/MID 계약, PG 정산 계좌, 세금 처리, 개인정보·약관, 상점관리자 환불/민원 처리, 금융 사고·중복 청구 복구와 2인 승인, 사용자 권한, 운영 모니터링 완료 증명.
6. 별도 계약 라이브키 TOSS_LIVE_CLIENT_KEY, TOSS_LIVE_SECRET_KEY 를 서버 암호화 비밀값으로 입력. 검증된 PG 판매자/MID 동일성을 확인.
7. 토스페이먼츠 운영 MID(상점아이디, 정확한 문자열)를 계약 서류 및 운영 키 소속 상점과 대조하고 `EKODIPAY_TOSS_MID`로 서버에 설정해야 합니다. 승인 응답과 재대조 응답의 `mId`가 다르면 결제 완료를 기록하지 않습니다. `currency=KRW`, PG 최종 `DONE`, 결제수단 `카드`·`간편결제`·`계좌이체`만 즉시 승인 완료로 인정하고 `가상계좌`·`휴대폰` 등 다른 수단은 대조 보류합니다. PG 상점 관리자에서도 비동기 입금 수단을 반드시 비활성화해야 하며, 웹훅·입금 확인이 없는 가상계좌는 운영 활성화 금지입니다.
8. 기존의 기본 비활성화 값을 해제하려면 새로운 정확한 SHA 및 재무 최종 승인을 거친 보호된 릴리스에서 PAYMENT_EXECUTION_MODE=live, EKODIPAY_PG_CONTRACT_VERIFIED=YES, EKODIPAY_SETTLEMENT_OWNER_VERIFIED=YES 를 설정. 운영자 전용 대조키 EKODIPAY_OPERATOR_TOKEN (32자 이상)도 별도 암호화 비밀값으로 지정하고, 승인 불확실 거래를 PG 주문 조회로 복구하는 권한과 절차를 점검합니다. 또한 EKODIPAY_REFUND_POLICY_VERIFIED=YES, EKODIPAY_RECONCILIATION_VERIFIED=YES, EKODIPAY_APPROVED_ORDER_ISSUER_VERIFIED=YES, EKODIPAY_DELAYED_METHODS_DISABLED=YES 가 모두 필요합니다. EKODIPAY_LIVE_OWNER_GATE=APPROVED 도 운영 비밀값으로 설정. 어느 조건 하나라도 빠지면 금전 거래 불허.
9. 정상 배포 뒤에도 실제 소액 거래, 취소 및 정산은 명시적인 재무 승인과 본인 확인 후 실증. 단순 배포 성공만으로 금전거래 완료 보고 금지.

## 아직 운영 전 반드시 보완할 기능
- 실제 서비스의 서버 승인 견적·주문 발급과 고객 인증/유효기간.
- 운영자 인증을 요구하는 POST /ekodipay/api/operator/reconcile 은 PG 주문 조회(GET /v1/payments/orders/{orderId})로 승인 불확실 거래를 재대조할 수 있습니다. 실제 테스트키·주문 발급·회계 보고서는 아직 검증 대상입니다.
- 정품 PG 웹훅 재조회, 중복 이벤트 방지, 비동기 입금·취소 반영.
- POST /ekodipay/api/operator/refund 는 현재 423으로 차단합니다. 별도 운영자 검증·2인 승인·멱등키를 포함한 전액/부분 환불, 정산/부가세 대조 기능이 추가되기 전까지 PG 콘솔을 사용해야 합니다.
- 에코디몰/교육/기타 사업자의 판매자별 PG·원장·정산 분리.
- PC/모바일 실제 PG SDK와 인증 정책/접근성/개인정보 관리 실증.

## 공식 문서
- https://docs.tosspayments.com/guides/v2/get-started/payment-flow
- https://docs.tosspayments.com/guides/v2/payment-widget/integration
- https://docs.tosspayments.com/reference
- https://docs.tosspayments.com/guides/v2/webhook

## 실제 운영자에게 요청해야 하는 사항 (비밀값을 채팅으로 전달하지 않기)
- EKODI Pay 계약 명의 법적 사업자/사업자등록번호의 확인 여부, 판매 주체가 에코디비즈 단일 상점인지 여부, 담당 관리자 연락처 및 고객센터 노출 주소.
- 토스페이먼츠 가맹점 계약·심사 완료 여부, 승인된 MID, 이용 가능한 카드·간편결제·계좌이체 수단 및 테스트 키와 운영 키의 소속 상점 일치 여부.
- 정산 계좌 예금주·사업자 일치와 취소·환불·정산 담당자 및 최종 재무 승인자 확인.
- 고객센터/사업자 정보/취소·환불 정책/개인정보처리방침 링크 확정 후 공개 화면 및 관리자 정책에 반영.
- 테스트·운영 PG 시크릿키와 서비스 토큰은 **Cloudflare Worker 암호화 secret** 으로만 등록하며, 이 대화·GitHub PR 본문·스크린샷에 노출 금지.

## 추가 라이브 승인 증빙
- 토스페이먼츠 응답의 `mId`와 Cloudflare에서 설정한 `EKODIPAY_TOSS_MID`를 정확히 대조. 개발자 키 형식만 맞춘 것은 소유권 검증이 아닙니다.
- 취소·환불은 현재 `/api/operator/refund`에서 HTTP 423으로 **차단**되어 있습니다. 운영자 PG 콘솔에서 정식으로 환불할 수 있는지, 이중 승인·정산 대조·장애 복구 체계를 실증해야 라이브 개방 검토가 가능합니다.
- 라이브 전 PG 테스트키로 성공·실패·중복 클릭·승인 타임아웃·금액 위변조·승인 뒤 환불·PC·모바일 검증을 완료. 실거래 소액 테스트는 별도 허가와 본인 확인이 필요합니다.
- PG SDK에서 가상계좌 등 늦게 확정되는 수단이 보이지 않도록 설정. API가 예상 밖 수단을 반환하면 주문은 `requires_reconciliation`로 유지되며 자동 결제 성공 처리를 금지합니다.
- 실제 거래를 위해 필요한 판매 승인 주문 발급기는 아직 독립 서비스에 연결되지 않았습니다. 위장 승인·브라우저 주문금액을 허용하지 않으며, 승인 주문 발급기 연동/실증 없이 실결제 개방 금지.
