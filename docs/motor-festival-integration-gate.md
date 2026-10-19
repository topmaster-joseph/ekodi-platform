# 모터페스티벌 2026 상가 참여 신청 — 운영 통합 기준

- 사업: 2026년 제2회 전남폴리텍 모터페스티벌 (행사 2026-10-25, 신청 마감 2026-10-25 08:00 KST)
- 운영 주체: 청계면상인회 (EKODI tenant `cgma`, scope `cheonggye-merchant-association`)
- 작업: EKODI 공식 복구 브랜치 `ai/chatgpt/orch_recovery_e68a9e5bf49f140f31bc36217d5eadea` / PR #5315

## 운영 주소 (서브도메인 없음)
| 구분 | 주소 | 담당 런타임 |
|---|---|---|
| 신청 화면 | `https://ekodi.kr/cgma/motor-festival-2026/` | Shared Site (`cgma-motor-festival-route.js`, deploy-site-core) |
| 관리자 화면 | `https://ekodi.kr/cgma/motor-festival-2026/admin/` | Shared Site |
| 신청·조회 API | `https://ekodi.kr/api/merchant-events/motor-festival-2026/applications` | Control API (`motor-festival-registration-api.js`, deploy-control-api) |

`ekodi.kr/api/*` → Shared Site `routeCanonicalSurface` → `CONTROL_API` → `customer-entry-worker.js` → 본 핸들러.

## 저장소 결정
- 운영 저장소는 Control API D1 `ekodi-auth`의 `cgma_motor_festival_2026_applications` (migration `0199`).
- EKODI Worker는 Supabase service-role 키를 보유하지 않는다(저장소 불변식·테스트로 강제). 운영 Supabase(`renzehysxirjilvdxacv`)에는 행사 테이블이 없다.
- 개발 Supabase(`lxcxwbdwwojjkgybbqii`)의 Edge Function `motor-festival-2026`과 `supabase/dev/motor-festival-2026-retention.sql`은 **개발 원형(prototype)** 으로만 보존한다. 운영 경로가 아니며 실제 참가자 개인정보를 개발 환경으로 유도하지 않는다.

## 보안·권한
- POST: 비로그인 허용. 동일 출처(`Origin: https://ekodi.kr` 또는 없음, `x-ekodi-intake-request: 1`), JSON 8KB 상한, 허용 필드·값 목록 검증, 동의 필수, honeypot, `Idempotency-Key` 재전송 시 동일 접수번호.
- 요청 제한: 같은 네트워크 10분 20건 + 같은 연락처 24시간 3건 + 전체 2,000건 상한(초과 시 429, 저장하지 않음). 교차 출처 쓰기는 마감 후에도 항상 403.
- 접수번호(`MF26-XXXXXXXX`)는 D1 재조회로 저장이 확인된 뒤에만 반환. 저장 실패 시 503.
- GET: `resolveTenantAccessAuthority(tenant=cgma)` — 플랫폼 `super_admin` 또는 cgma 활성 권한(owner/admin 등 접근관리 가능 역할)만 200. 비로그인 401, 일반 회원·기타 역할 403. 모든 조회는 `cgma_motor_festival_2026_access_audit`에 기록(관리자·건수만).
- `?view=summary`: 개인정보 없는 집계만 반환. 관리자 화면의 "통계 복사"도 집계만 복사.

## 개인정보
- 담당자 성명·연락처·건의사항은 AES-256-GCM(HKDF 파생, Worker secret `MOTOR_FESTIVAL_PII_KEY`) 암호문으로만 저장하며, 암호문은 `테이블|컬럼|행ID`에 결속(AAD)된다. 배포 파이프라인은 비밀 목록 조회가 성공하고 키가 없을 때만 키를 생성한다(키 교체로 인한 복호화 불능 방지). 중복 판단은 HMAC 해시. 키는 배포 파이프라인이 생성하며 값은 출력·열람하지 않는다. 키가 없으면 신청·조회 모두 503(fail closed).
- 보존기한: `expires_at = 2026-11-23T15:00:00Z` (2026-11-24 00:00 KST). Control API 10분 cron(`customer-entry-worker.scheduled`)이 만료 행을 삭제 → 행사 종료(10-25 17:00) 후 30일 이내 파기.
- 로그: 요청 본문·신청 필드를 기록하지 않는다(오류 클래스명만).
- D1 time-travel 백업은 Cloudflare 보존기간(확인필요: 요금제별 최대 30일) 경과 후 소멸.

## 검증
- `test/motor-festival-registration.test.mjs`, `test/cgma-motor-festival-route.test.mjs` (실제 migration을 node:sqlite로 실행).
- 배포 후 자동 점검(deploy-control-api): 비로그인 GET 401, 교차 출처 POST 403, PII 키 존재(이름만) — 신청 데이터는 쓰지 않음.
- 실서비스 신청·관리자 조회 실증은 가상 데이터로 수행 후 삭제.

## 운영 후속 (Human Gate)
- 2026-11-24 파기 완료 확인 후 `MOTOR_FESTIVAL_PII_KEY` 삭제 권장 → D1 time-travel·일일 R2 백업에 남은 암호문까지 복호화 불가(암호학적 파기). 삭제 시 배포 파이프라인이 새 키를 만들지만 데이터가 없으므로 영향 없음.
- 개발 Supabase(`lxcxwbdwwojjkgybbqii`)의 `motor-festival-2026` 함수와 테이블은 평문 원형이므로 행사 운영과 무관하게 정리(삭제) 권장 — 데이터 삭제가 포함되어 소유자 승인 필요.
