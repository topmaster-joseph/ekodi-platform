# 에코디 동행 — 개통 관문 체크리스트 (현재 상태)

기준일: 2026-10-26 · 근거: 저장소 main, 운영 Supabase(ekodi-platform-prod) 읽기 전용 조회
판정: **미개통 유지.** 아래 ⛔ 항목이 모두 ✅가 되기 전에는 `config/singles-feature-flags.json`의 회원 대상 스위치를 켜지 않는다.

범례: ✅ 완료 · 🟡 부분 완료 · ⛔ 미완(개통 차단) · 👤 사람 결정·법률 판단 필요

## A. 법률·동의 (CONSENT-REVIEW 개통 전 필수 1~6)

| # | 관문 | 상태 | 현재 근거 / 남은 일 |
|---|---|---|---|
| A1 | 개인정보처리자·책임자·위탁·국외이전·보유기간·파기 확정 | ⛔👤 | 보유기간·파기 설계안은 `EKODI-SINGLES-WITHDRAWAL-DATA.md`(승인 대기). 처리자 법적 명칭·책임자 지정 미정 |
| A2 | 동의 항목 분리, 불필요한 동의 강요 금지 | 🟡👤 | 필수·신앙(민감)·공개·결혼연결이 각각 분리 저장되고 영수증에 선택값이 기록됨(2026-10-26). **결혼연결 선택 시 신앙 동의 필수** 결합이 허용되는지 법률 판단 필요 |
| A3 | 성인확인 기관 결과를 `adult_verified_at`에 반영하는 신뢰 경로 | ⛔👤 | 미구현. 현재는 만 19세 자기선언뿐이며, 그래서 탐색·호감·메시지·주문은 모두 막혀 있음(안전한 쪽 잠금). 인증 기관 선정 필요 |
| A4 | 실제 인가된 EKODI 테스트 계정으로 가입→동의→프로필→철회→무권한 차단 실증 | ⛔ | 미실시. 아래 C3과 함께 진행 |
| A5 | 결혼중개업 해당 여부, 유료 메시지·행사비·입금 개통 여부 | ⛔👤 | 법률 검토 전. 결제 운영자 0명, 계좌이체 접수 스위치 OFF |
| A6 | 확정 문안 버전·시행일 부여, UI·API 동의 버전 동기화 | ⛔👤 | 동의 버전이 아직 `…-draft`. A1·A2 확정 후 |

## B. 보안·데이터 (이번 개선 라운드 결과)

| # | 관문 | 상태 | 근거 |
|---|---|---|---|
| B1 | 동행 테이블 RLS·브라우저 직접 접근 차단 | ✅ | 31개 테이블 모두 RLS ON, anon·authenticated 읽기 권한 0 (2026-10-26 실측) |
| B2 | 결제 직무 분리(본인 주문 승인 금지) | ✅ | `singles_bank_confirm_order` 가드, 운영 롤백 프로브로 확인 |
| B3 | 계좌·요금 설정 저장 권한 | ✅ | service_role INSERT/UPDATE 부여, 저장 시 접수 자동 중지 유지 |
| B4 | 남용 방지 속도 제한(호감·신고·차단·메시지) | ✅ | DB 원자 처리, 초과 시 429 |
| B5 | 탈퇴 시 재가입 대화 부활 방지 | ✅ | 연결 `withdrawn` 종료, 메시지 원문은 보존 |
| B6 | 탈퇴 데이터 물리 삭제·익명화 | ⛔👤 | 설계안만 존재(A1과 연동) |
| B7 | 신고 처리 운영자 API·화면·감사 기록 | ✅ | 검토 운영자 2명 지정(joseph@ekodi.kr, topmaster.joseph@gmail.com) |
| B8 | 로그인 라이브러리 무결성(SRI)·CSP 자체 출처 | ✅ | 2.117.3 자체 호스팅, 변조 시 차단 확인 |
| B9 | 민감정보 동의 증빙 | ✅ | 영수증에 신앙·결혼연결 선택값 기록, 결혼연결⇒신앙 CHECK |
| B10 | 모임(groups)·매치·통합 감사 테이블 | 🟡 | MVP 문서의 일부 표는 미구현. 개통 범위에서 제외할지 결정 필요 👤 |

## C. 배포·운영

| # | 관문(MVP 계약 `gates`) | 상태 | 근거 / 남은 일 |
|---|---|---|---|
| C1 | design-review | 🟡 | 문서 세트 존재(MVP·SUBSCRIPTION·CONSENT-REVIEW·WITHDRAWAL-DATA·이 문서). 최종 승인 기록 없음 |
| C2 | legal-consent-review | ⛔👤 | A 섹션 |
| C3 | dev-migrations-rls | ✅ | 운영 DB 마이그레이션 적용·RLS 확인. 개발 DB 동기화 여부는 확인필요 |
| C4 | synthetic-role-e2e | ⛔ | 회원·운영자·검토자·무권한 역할별 합성 계정 E2E 미실시 |
| C5 | staging | 🟡 | 사이트 배포 레인의 staging 관문은 통과하지만 동행 회원 기능은 스위치 OFF라 실제 흐름 미검증 |
| C6 | guarded-release | ✅ | 사이트: Shared Site Core 레인 / 서버 함수: `deploy-singles-api.yml`(출처 게이트·DB 계약 확인·자동 롤백), 병합 후 자동 디스패치 실측 성공(2026-10-26) |
| C7 | production-canary | ⛔ | 개통 시 소수 계정으로 스위치를 단계적으로 켜는 절차 미작성 |

## D. 기능 스위치 현황

정본: `config/singles-feature-flags.json` (테스트가 코드·설정·문서와의 불일치를 막음)

| 스위치 | 위치 | 현재 값 |
|---|---|---|
| `SINGLES_M1_ENABLED`, `SINGLES_SOCIAL_ENABLED`, `SINGLES_PAID_ACTIONS_ENABLED`, `SINGLES_BANK_TRANSFER_ENABLED`, `SINGLES_BANK_VERIFICATION_ENABLED` | Worker(`wrangler.site.toml`) | 모두 `"false"` |
| `SINGLES_ONBOARDING_ENABLED`, `SINGLES_SOCIAL_ENABLED`, `SINGLES_BANK_*` | Edge(Supabase 비밀값) | 확인필요 — 저장소에서 볼 수 없음. Worker가 앞단에서 막고 있어 회원 노출은 없음 |

## 개통까지 권장 순서
1. 👤 A1·A2·A5 법률 판단 → A6 문안 확정
2. A3 성인인증 기관 연동
3. C4 합성 계정 E2E(A4 포함) → C5 스테이징에서 스위치 ON 리허설
4. C7 카나리 절차 작성 → 소수 계정 개통 → 전체 개통
