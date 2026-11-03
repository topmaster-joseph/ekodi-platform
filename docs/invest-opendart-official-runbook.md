# EKODI Invest — OpenDART 공식 공시 연결 운영 절차

작업: invest-opendart-official-connector-20261103 · 공시 읽기 전용 · 실계좌 주문 기능 없음.

## 운영 대상
- Cloudflare Worker: `ekodi-workspace-platform-api`
- 공식 사이트: https://ekodi.kr/my/invest
- 비밀 설정 이름(Secret): `OPENDART_API_KEY` (발급된 키 값이나 스크린샷을 GitHub·채팅에 기록하지 않음)
- 공개 가격 공급자: 별도 KIS 인증·계약과 시세 신선도 검증 필요. DART는 가격 공급자가 아님.

## 사용자 경로
1. OpenDART 인증키 발급 후 Cloudflare Worker **Secret**에 `OPENDART_API_KEY`로 등록.
2. 동일 Worker의 중앙 릴리스가 완료된 후 최고관리자 본인 계정으로 EKODI 로그인.
3. `/my/invest`의 AI 전략 연구 → 단기 가치발굴에서 연결 준비 확인.
4. 본인 추가 인증 및 Supabase OTP AAL2 완료.
5. 공시 기업의 **DART 기업 고유번호 8자리**를 입력. 한국거래소 종목코드 6자리를 입력하지 않음.
6. 연도·보고서 종류(사업/1분기/반기/3분기)·연결 또는 별도 제무제표 선택 후 '공식 공시 조회'.
7. 실제 OpenDART `company.json`과 `fnlttSinglAcntAll.json` 응답의 기업명·종목코드·계정·원천금액·원본 접수번호 확인.

## API와 실패시 처리
- Workspace canonical prefix: `https://ekodi.kr/workspace-api`.
- Readiness: GET `/v1/invest/autopilot/research/short-term-value` (키의 존재 여부만 기록, 실제 API 인증 성공을 뜻하지 않음)
- Company: GET `/v1/invest/autopilot/research/opendart/company?corp_code=XXXXXXXX`
- Statement: GET `/v1/invest/autopilot/research/opendart/financials?corp_code=XXXXXXXX&year=2025&report=11011&fs=CFS`
- 지정된 모든 GET 경로는 소유자 검증·2차 확인·JWT AAL2 이후에만 외부 호출.
- 비정상 키/원천 장애/조회 데이터 없음/호출 한도는 성공 응답으로 오인하지 않음.
- OpenDART 공식 문서: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020
- 사용자 코드/계좌번호/실시세/체결/수익 전망을 생성하지 않음. 입력 계정 금액은 재무제표 기간 값으로 최신 주가·시장 가치나 실제 공시 발표 시각이 아님.

## 안전 경계
- 서버 비밀키는 API 호출에만 활용. 키 자체를 HTTP 응답, 오류, 로그 또는 저장소에서 읽어 노출하지 않음.
- 발급키 존재/정상 응답/전략 점수/모의 운용/실거래 실행은 각각 다른 상태이며 자동으로 다음 단계로 승인되지 않음.
- KIS 실거래 주문 엔드포인트는 이 변경으로 추가되지 않으며 기존 HTTP 423 잠금 유지.
- 후속 자동 분석은 공식 시세+개별 기업 공시의 시점 일치, 업종 비교군, 정보 이용약관, API 한도, 공시 정정 이력 검증 이후 별도 안전 검증 과제로 처리.
- Cloudflare Secret 확인이나 본인 OTP 완료는 코드 에이전트가 대리할 수 없음. 실제 운영 증거를 확보한 경우에만 '연동 완료' 보고.
