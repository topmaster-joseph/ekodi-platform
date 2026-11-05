# EKODI · KG이니시스 통합본인인증 V2 연동 운영서

기준: 2026-11-05. 기존 에코디 성인인증 코어를 재사용하며 별도 서버·로그인·DB를 만들지 않는다.
연동 구조: EKODI 인증 화면 → PortOne V2 SDK → KG이니시스 통합인증 → PortOne 서버 결과 조회 → EKODI 성인 판정.

## 계약 / 발급

1. KG이니시스 **통합 본인인증** 계약 및 업종별 인증기관 심사를 먼저 진행한다. 미팅·채팅 서비스 및 성인몰은 심사 기준이 다르므로 각 서비스의 실제 이용 목적을 고지한다.
2. 포트원 관리자 콘솔 > 결제 연동 > 연동 정보 > 채널 관리 > 채널 추가 > KG이니시스 > 본인인증 통합인증을 선택한다.
3. 테스트 모드는 포트원 문서의 MIIiasTest를 이용할 수 있다. 이는 운영 LIVE 결과를 대체하지 못하며 에코디 운영 성인 인증으로 승인되지 않는다.
4. 운영 채널은 이니시스 발급 MII… 상점 ID와 전용 apikey를 **포트원 관리자 콘솔에만** 등록한다. 기관별 심사에서 승인된 수단만 인증창에 표시된다.
5. 별도로 포트원 상점 ID, V2 API Secret 및 본인인증 통합인증 전용 channel-key를 확인한다. 결제 채널의 키와 혼용하지 않는다.

## Cloudflare Worker 서버 설정

실제 비밀키나 개인정보를 문서·이슈·PR·브라우저에 입력하지 않는다. 기존 D1 DB 및 Supabase 설정을 재사용한다.

| 설정 이름 | 내용 |
| --- | --- |
| AGE_VERIFICATION_ENABLED | 전체 성인인증 활성화 스위치. 계약 전에는 false 또는 미설정 |
| AGE_VERIFICATION_SITE_POLICIES | {"singles":"civil_adult_19"} 등의 사이트별 법적 연령 목적 |
| AGE_VERIFICATION_SITE_PROVIDERS | {"singles":"kg-inicis-unified"} 를 사용. 미지정 사이트는 기존 portone-v2 |
| AGE_VERIFICATION_INICIS_CONTRACT_APPROVED | 이니시스 계약·업종 승인 후에만 true; 그 전에는 KG API가 enabled:false |
| PORTONE_INICIS_AGE_CHANNEL_KEY | 본인인증 전용 channel-key-… |
| PORTONE_AGE_STORE_ID | 기존 포트원 V2 store-… |
| PORTONE_AGE_API_SECRET | 기존 포트원 V2 API Secret; Worker Secret에서만 보관 |
| DB / SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | 기존 에코디 공통 인증 인프라 재사용 |

기존 PORTONE_AGE_CHANNEL_KEY는 옛 공급자용으로 보존한다. 테스트 환경 키가 실제 개인정보 인증에 사용되지 않도록 KG 운영 승인과 결과 채널 LIVE를 모두 요구한다.

## SDK / 결과 처리

- 인증 화면: https://ekodi.kr/verify/adult/?site=singles
- KG 공급자는 서버에서만 결정하고 임의 클라이언트 입력으로 바꿀 수 없다.
- PortOne.requestIdentityVerification에 KG 전용 bypass.inicisUnified.flgFixedUser = "N"을 지정한다. 이는 인증기관이 이용자정보를 직접 입력받도록 한다.
- 모바일 복귀 후 거래 ID는 주소창에서 제거한다. 서버는 거래 ID, 로그인 사용자 UUID, 사이트와 정책을 다시 확인한다.
- 서버만 포트원 REST API로 실제 VERIFIED 결과를 재조회하며, 동일 채널키와 LIVE 타입, 출생일을 확인한다.
- 기존 공급자 거래 ID는 ekodi-age-…이고 KG 거래 ID는 ekodi-inicis-…로 분리된다. 공급자 전환 시 이전 인증 권한을 새 인증으로 인정하지 않는다.
- 인적사항 원본(이름/생년월일/휴대전화/CI/DI)은 에코디 인증 저장소에 보관하지 않는다.
- 관리자 현황 API는 siteProviders / siteReadiness / 건수만 조회하며, 사용자 식별정보와 API Secret을 제공하지 않는다.

## 운영 개통 절차 (승인 게이트)

1. KG이니시스의 해당 서비스 업종·인증기관별 계약 및 포트원 LIVE 채널 활성화 확인.
2. 개인정보 제공 및 처리 위탁 고지, 이용목적별 성인 기준과 재확인 주기 검토.
3. 비밀정보를 Cloudflare 서버 Secret에만 등록.
4. 모의 테스트: 등록 없는 사이트, TEST 응답, 오류 채널, 잘못된 생년월일, 미성년자, 다른 계정, 다른 사이트, 중복 사용 및 만료 모두 거절.
5. 스테이징 안전성 및 운영 제한 실증 뒤 승인된 사이트별 정책과 계약 완료 플래그를 활성화.
6. 실제 이용자 1건의 적법한 동의 인증·취소·실패·모바일 복귀 E2E 확인 전 "실제 개통 완료"를 보고하지 않는다.

## 비용과 제약

포트원 공개 안내는 성공 건당 40원(VAT 별도), 통합인증 단독 계약 시 가입비 면제·연관리비 면제 조건을 안내한다. 금액 및 업종 제한의 최종 판단은 신규 계약·기관별 심사 결과를 따른다. 네이버·카카오·토스 등은 성인 업종 제한이 있으며, PASS도 목적에 따라 제한될 수 있다.

## 공식 출처

- https://developers.portone.io/opi/ko/integration/pg/v2/inicis-unified-identity-verification
- https://developers.portone.io/opi/ko/extra/identity-verification/readme-v2
- https://developers.portone.io/api/rest-v2/identityVerification
- https://help.portone.io/content/inicis
- https://guide.portone.io/6a1cba84-a99b-4ee1-a5a8-fffea0092399
