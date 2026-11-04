# EKODI 성인인증 공통서비스 — 초기 연동 계약

**작업**: adult-verification-shared-20261104, agent chatgpt
**보안 기본값**: 비활성화(fail closed). 인증기관 계약/채널 키와 중앙 배포 게이트 충족 전 운영 활성화 금지.

## 역할 및 법적 분리

- EKODI는 본인확인기관이 아니다. 인증 결과를 위탁 인증기관/연동 사업자의 공식 서버 API에서 재조회하는 **의존성 교체 가능한 인증 중계 코어**다. 실제 본인확인은 관련 계약/적법한 공급자가 수행한다.
- \`civil_adult_19\`: 민법 제4조 **만 19세 생일을 지난 경우**에만 통과한다(동행 등 법적 성년 필요 서비스).
- \`youth_protection_19\`: 청소년 보호법 제2조 **19세가 되는 해 1월 1일 이후**에 통과한다(법적 목적이 일치하는 매체물 등에 한정).
- 동의/결제/사이트 회원 권한은 별도 검증한다. 이 코어의 \`verified: true\`는 연령 적합성만 증명한다.
- 알코올/담배 등 규제 상품의 판매 가능 여부, 의료·금융 접근권, 법률상 성년은 서로 동일하지 않다. 사이트별 별도 법률·사업자·인증수단 심사가 필요하다.

## API

배포 경로: 기존 **Control API Worker** 재사용(신규 Worker/도메인 없음).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | \`/api/age-verification/config?site=singles\` | 해당 사이트 연동 준비 여부 및 공개 식별자(비밀키 아님) |
| POST | \`/api/age-verification/start\` | \`{"site":"singles"}\`와 Supabase Bearer 토큰; 서버 발급 거래ID/공개 채널 식별자 |
| POST | \`/api/age-verification/complete\` | \`{"site":"singles","identityVerificationId":"ekodi-age-..."}\`; 인증사 서버 재조회 후 결과 확정 |
| GET | \`/api/age-verification/status?site=singles\` | 같은 사용자·사이트·정책에 대한 유효한 성인 확인 여부 |

모든 민감 메서드는 \`Authorization: Bearer <Supabase access token>\` 필수이며 결과는 \`Cache-Control: no-store\`. POST 사용자 입력에 생년월일·전화번호·이름·CI/DI를 받지 않는다. SDK \`requestIdentityVerification()\` 결과의 ID만 서버로 제출한다. 성공 판정은 SDK 반환값이 아닌 인증기관 서버의 \`VERIFIED\` 증명에만 기반한다.

## 운영 설정 (서버 전용)

- \`AGE_VERIFICATION_ENABLED=true\`
- \`AGE_VERIFICATION_SITE_POLICIES={"singles":"civil_adult_19"}\` — 명시적으로 허용한 서비스만 개통, \`ekodimall\` 등은 사업·법률 확인 후 개별 추가.
- \`PORTONE_AGE_STORE_ID=store-...\`, \`PORTONE_AGE_CHANNEL_KEY=channel-key-...\` — 브라우저 공개 가능.
- \`PORTONE_AGE_API_SECRET\` — Cloudflare Workers secret에만 저장. UI·Git·로그·PR에 기록 금지.
- 기존 환경의 \`DB\`, \`SUPABASE_URL\`, \`SUPABASE_PUBLISHABLE_KEY\` 재사용.

D1 스키마 \`migrations/202611042330_age_verification_core.sql\`을 중앙 승인된 마이그레이션 경로로 **먼저** 적용한다. 실제 공급사와 사용 목적별 계약을 확인하고 인증 테스트를 마친 후 설정한다. 기존 동행 \`/singles/verify\`는 기존 포트원 경로를 유지하며, 공통 경로로 바꾸는 작업은 독립 후속 PR로 진행한다.

## 보안·프라이버시

- 거래 ID는 서버에서 랜덤 생성, 계정·사이트·법적 목적에 결합, 10분 후 만료, 중복 사용 시 차단
- 인증 시도 하루 최대 5회/계정, 인증 결과 유효 90일
- 저장 항목: 인증 ID, Supabase 사용자 UUID, 서비스 ID, 정책, 상태, 생성/만료/확정 시각
- **미보관**: 이름·생년월일·전화번호·주민등록번호·CI·DI·인증기관 원본 응답
- 기존 Control API Worker의 스케줄러에서 시도 기록 30일 후, 만료된 인증 권한은 즉시 또는 정기적으로 제거
- 클라이언트는 독립 판단 금지. 보호할 서비스의 **서버**가 매 접근 시 같은 사용자+사이트+정책의 유효한 인증을 조회해야 한다.
- 공급사 설정 누락, 인증 통신 오류, 만료 거래, 교차 계정/사이트 사용, 공급사 결과 불일치 시 반드시 실패 처리.
- 위임 서명 토큰이나 타사 고객용 API 키 발급, 다중 고객 사업자 과금, 정식 중계사업 운영은 별도 계약·보안 검토 전 금지.

## 릴리스 체크리스트

1. 현재 헌법·21 속성·C2/C3 규칙 검토, 공통 코어 경계 유지
2. D1 마이그레이션 스테이징 적용 및 테스트
3. 모듈·인증·상태 조회·리플레이/정책 교차·인증기관 오류 테스트
4. 중앙 오케스트레이터 공식 회복 PR을 통한 보호 병합, 승인된 CI/배포 워크플로
5. 운영 도메인 \`https://ekodi.kr/api/age-verification/config?site=singles\` 비활성(default) 점검, 활성화 시 실제 공급사 테스트 및 권한 제한 검증
6. 확인 결과를 증거로 남기기 전 "배포 완료"로 보고 금지

### 출처
- https://developers.portone.io/opi/ko/extra/identity-verification/readme-v2
- https://developers.portone.io/api/rest-v2/identityVerification
- https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1026056227
- https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1019739619
