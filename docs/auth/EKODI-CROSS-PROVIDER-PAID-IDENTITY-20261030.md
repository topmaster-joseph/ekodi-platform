# AUTH-BILLING-IDENTITY-001 — 하나의 EKODI ID, 여러 로그인 수단, 일관된 유료회원 자격

기준: 2026-10-30. **보호 PR / 운영 미배포**. 기존 사용자의 계정이나 실제 결제 내역을 자동으로 변경하지 않는다.

## 사용자에게 보이는 로그인

- 사용자용 주 버튼은 단순히 **로그인**. 구글 관리자 로그인이라는 별도 회원 종류를 만들지 않는다.
- 인증 제공자는 Google / (키·운영검증을 마친) Kakao·Naver / (메일 게이트를 연) 이메일·비밀번호 / 향후 Apple·Microsoft·패스키를 선택할 수 있다.
- 결과는 항상 `people.ekodi_id` 하나. 원래 페이지 복귀, 무료회원 기본자격, 워크스페이스 역할, 유료등급, 관리자 Capability는 별도의 서버 검증이다.
- 일부 사이트의 독립 이메일·비밀번호 운영자 접속은 **해당 사이트·업무 범위**에서만 사용한다. 중앙 최고관리자 권한으로 승격시키거나 고객 결제수단으로 사용할 수 없다.
- 최고관리자도 어떤 활성 로그인 경로를 썼든 **그 EKODI Person에 직접 부여된 서버 권한** 및 고위험 행위의 추가 인증을 통과해야 한다. 현재 D1 관리자 콘솔은 Google 전용 검증으로 만들어져 있으므로, 다중 로그인으로 중앙 Admin OS에 들어가는 기능은 별도의 신뢰 가능한 세션 발급/검증 브리지를 구축한 뒤 활성화한다. UI 라벨 변경은 기능 활성화의 증거가 아니다.

## 같은 사람 판정

1. 새 로그인에서 공급자의 서명/토큰, audience, nonce, state, 만료, 제공자별 고유 subject를 서버가 검증한다.
2. 사용자가 *이미 로그인된 계정에서* '로그인 수단 추가'를 시작하면, 현재 계정의 유효한 세션과 두 번째 공급자 소유권 확인을 함께 요구한다. 고위험 계정은 최근 재인증 및 관리상 확인이 추가된다.
3. `login_identities`의 해당 verified provider subject가 다른 EKODI Person의 인증수단으로 이미 연결된 경우에는 충돌을 반환한다. 같은 이메일, 표시이름, 전화번호, IP 또는 기기만으로 자동 병합하지 않는다.
4. 과거 각각 가입한 두 EKODI Person을 합치기 전에는 양쪽 소유권 증명, 결제 원장/환불/중복 청구, Workspace 역할/관리자 권한, 포인트 잔고 및 구독의 활성 상태를 대조한다.
5. 이미 각각 결제된 두 유료 계정을 자동으로 하나로 선택·해지·환불·이전하지 않는다. 결제 충돌은 `ACCOUNT_BILLING_RECONCILIATION_REQUIRED`로 차단하고 담당자 검토/사용자 동의/회계 증빙 후 별도 조치한다.

## 회원등급 계약

```
Login Identity (Google / Kakao / Naver / email / ...)
   -> validated Person (ekodi_id)
   -> subject_key = person:<person_id>
   -> FREE (통합 기본)
   -> 서비스별 정식 구독·결제 원장 (독립)
   -> 워크스페이스별 실제 역할/권한 (독립)
```

'통합 계정 유료'는 **동일 EKODI Person이 동일 서비스를 이용할 때** 모든 로그인 방식에서 동일해야 한다는 뜻이다. A 서비스의 유료등급이 B 서비스 전체를 무료 업그레이드하는 뜻은 아니다.

- 신규 개인 구독: D1 `service_subscriptions.subject_type=person`, `subject_key=person:<uuid>` 기준.
- 기존 구독: 같은 Person의 로그인으로 검증된 옛 `auth_user_id` 및 legacy Person 키만 조회; 임의의 이메일로 타인의 유료구독을 찾아오지 않는다.
- 개인 회원 조회는 canonical FREE보다 단일 유효 legacy PAID를 우선한다. 동일 Person의 2건 유료 구독은 충돌 상태로 차단하며 새 결제를 시작하지 않는다.
- 유료 적용은 해당 결제 승인 상태, 유효기간, 취소/정지 등 **서비스별 서버측** 검증을 통과해야 한다. 관리자 권한은 유료등급으로 자동 부여하지 않는다.
- 기존 청구원장, Toss 고객키·빌링키, 주기적 재결제 레코드, 포인트 이력은 읽기 대상이지 자동 덮어쓰기·합산 대상이 아니다.

## 운영 출시 순서 / 강제 가드

1. 배포 전 D1 유료 구독 자료 보존·롤백 수단, 인가 서버/스토어별 권한 원장 확인. 실사용자 개인정보/토큰을 테스트에 사용하지 않는다.
2. Supabase 인증 사용자만 호출 가능한 `current_ekodi_billing_identity()` migration을 DEV → STAGING → 운영 순으로 적용, RLS·권한 상승 회귀 검증. `auth.uid()` 이외의 외부 입력으로 다른 Person을 조회할 수 없도록 제한.
3. 동일인 복수 공급자, 완전히 분리된 유료계정, 충돌 구독, 복구/연결 해제, 관리자 역할 탈취, 미인증 이메일, 실결제 중복 방지 등의 비실명 테스트 통과.
4. D1 membership consumer 코드 카나리: existing paid 유지, 신규 pay canonical key, legacy lookup, checkout callback `/auth/`, 병행결제 차단. 실제 Toss 자동 청구 테스트는 별도 승인 필요.
5. **기존 계정 병합 및 반복 청구**: 과거 독립 Person을 하나로 연결하는 시점에 두 활성 Toss 구독이 존재하면 정기청구 스케줄에서도 충돌을 차단하는 원장 기반 조정 기능이 추가로 필요하다. 이 기능과 회원 통합 검증 전에는 일반 운영자에게 '모든 구독 통합 완료'로 안내할 수 없다.
6. **Admin OS 다중 인증**: 현재 Google 전용 D1 관리자 토큰 발급을 유지하고, 새 발급 경로는 검증된 EKODI Person + 역할/Capability + audience/nonce/단기 서명 티켓 + 서버 세션 교환 + 고위험 step-up을 구현·침투 테스트한 이후에만 활성화한다. provider 이메일만으로 관리자 허용목록을 통과시키는 변경 금지.
7. 보호 CI, SHA 단위 승인, 스테이징 E2E, 운영 릴리스 및 실제 사용자 흐름 검증 후에만 완료 선언.

## 관련 파일

- `membership-identity.js`
- `membership-billing.js`
- `universal-membership.js`
- `supabase/migrations/20261030010000_current_ekodi_billing_identity.sql`
- `test/ekodi-cross-provider-paid-membership-20261030.test.mjs`
- `docs/auth/EKODI-ID-LOGIN-CHANNEL-BOUNDARY.md`
