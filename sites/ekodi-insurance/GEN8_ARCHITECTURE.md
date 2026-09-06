# EKODI Insurance · 8G Architecture

기준: 2026-09-06

EKODI Insurance 8G는 보험상품을 자동판매하는 엔진이 아니라, 사용자의 보험관리와 적법한 사람 연결을 중심으로 작동하는 순환형 서비스다.

## 사용자 순환

1. 보험·보험료·청구 필요를 브라우저에서 정리한다.
2. 무료 guidance engine이 확인 순서를 설명한다.
3. 사용자가 명시적으로 요청할 때만 상담 handoff를 만든다.
4. 연락처는 D1에 AES-GCM 암호화하고 상담대화 공유는 별도 선택동의를 받는다.
5. 승인된 운영주체가 상담을 처리한다.
6. 상담 단계와 비식별 성과를 outcome ledger에 기록한다.
7. 운영지표를 다음 서비스 개선과 재점검에 사용한다.

## 8G 운영망

- Partner Registry: 보험사·GA·설계사·제휴주체의 상태, 계약상태, feed 방식을 관리한다.
- Reference Catalog: 상품·보장자료 메타데이터를 관리한다. 원본 계약·건강정보를 저장하지 않는다.
- Human Handoff: 고객이 요청한 상담건만 승인된 운영주체에 연결한다.
- Outcome Feedback: 배정·연락·완료 등 운영단계와 비식별 성과만 기록한다.
- Analytics: 상담 funnel을 읽되 고객 보험계약 원장이나 의료기록을 만들지 않는다.
## 비교 공개 게이트

공개 비교 경로는 기본 OFF다. `INSURANCE_COMPARISON_PUBLIC_ENABLED=true`만으로는 부족하며 다음 조건을 모두 만족한 자료만 나타난다.

- Partner status = `approved`
- Agreement status = `signed`
- Catalog status = `approved`
- Catalog comparison_approved = `1`

공개 경로는 `reference-only`이며 순위, 적합성 점수, 자동추천, 청약·계약체결을 수행하지 않는다.

## 중앙 관리자 경계

`admin.ekodi.kr → api.ekodi.kr → Insurance API → Insurance D1` 순서다. 중앙 경로도 `INSURANCE_ADMIN_ENABLED=false`가 기본값이다.

운영자가 관리하는 범위는 상담 Queue, Partner Registry, Reference Catalog, Outcome Funnel이다. 고객의 전체 보험계약·청구·건강 원장은 중앙 관리대상이 아니다.

## Production Gate

기술검증과 staging 배포는 자동화하되 production 공개는 다음 외부 게이트가 끝난 뒤에만 진행한다.

- 실제 서비스 운영주체와 상담 책임주체 확정
- 보험모집·광고 및 제휴관계 검토
- 개인정보 처리방침과 필수/선택 동의 문구 확정
- production 암호화키와 내부토큰의 안정적 보관

이 조건 전에는 `ins.ekodi.kr`의 실제 상품비교·추천·자동청약 기능을 열지 않는다.
