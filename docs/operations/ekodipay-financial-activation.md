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
7. 기존의 기본 비활성화 값을 해제하려면 새로운 정확한 SHA 및 재무 최종 승인을 거친 보호된 릴리스에서 PAYMENT_EXECUTION_MODE=live, EKODIPAY_PG_CONTRACT_VERIFIED=YES, EKODIPAY_SETTLEMENT_OWNER_VERIFIED=YES 를 설정. EKODIPAY_LIVE_OWNER_GATE=APPROVED 도 운영 비밀값으로 설정. 어느 조건 하나라도 빠지면 금전 거래 불허.
8. 정상 배포 뒤에도 실제 소액 거래, 취소 및 정산은 명시적인 재무 승인과 본인 확인 후 실증. 단순 배포 성공만으로 금전거래 완료 보고 금지.

## 아직 운영 전 반드시 보완할 기능
- 실제 서비스의 서버 승인 견적·주문 발급과 고객 인증/유효기간.
- PG 주문별 결제 조회(GET /v1/payments/orders/{orderId}) 및 결과 불확실 거래 수동 재대조, 이력/회계 보고서.
- 정품 PG 웹훅 재조회, 중복 이벤트 방지, 비동기 입금·취소 반영.
- 별도 운영자 검증·2인 승인·멱등키를 포함한 전액/부분 환불, 정산/부가세 대조.
- 에코디몰/교육/기타 사업자의 판매자별 PG·원장·정산 분리.
- PC/모바일 실제 PG SDK와 인증 정책/접근성/개인정보 관리 실증.

## 공식 문서
- https://docs.tosspayments.com/guides/v2/get-started/payment-flow
- https://docs.tosspayments.com/guides/v2/payment-widget/integration
- https://docs.tosspayments.com/reference
- https://docs.tosspayments.com/guides/v2/webhook
