# EKODI 통합알림 전체 사이트 점검 — 2026-11-21

중앙 이슈: [#9957](https://github.com/topmaster-joseph/ekodi-platform/issues/9957)
소스 작업 브랜치: `ai/chatgpt/notification-fleet-coverage-20261121`

## 운영 목표 및 진실성 기준

- 최고관리자 `소통·알림·메시징 > 알림`에서 *등록된 모든 기존 Workspace 사이트와 서비스*의 알림 주제 연결 상태, 서버 발행 준비, 시간창별 이벤트·대기·실패·지연, 최고관리자 사설 웹푸시 장치 등록 현황을 통합 조회.
- 등록부 출처는 `config/site-lifecycle-registry.json`과 `config/ecosystem-services.json`. 동일 정본 경로는 하나로 집계하고 retired/archive-only와 planned는 별도 집계.
- **등록부에 존재함, 토픽에 연결됨, 발행 서버가 구성됨, 전달 큐가 완료됨, 최종 휴대전화가 수신함**은 서로 다른 상태다. 마지막 단계는 현장 기기 검증 없이는 성공으로 표시하지 않는다.
- 신설 고객의 **동적** Workspace 사이트는 기존 두 정적 등록부에 없을 수 있으므로 현 단계 목록으로 "100% 모든 사이트"를 보증하지 않는다. 추후 인증된 실제 Workspace 등록원장을 결합해야 한다.
- 후속 표시 개선: **최고관리자 화면에서만** 기존 `/api/customers/directory`를 별도로 조회하여 정적 등록부에 없는 동적 고객 사이트를 '연동 상태 미검증' 목록으로 나열한다. 이 브라우저 화면의 표시는 서버 발신 권한을 생성하지 않으며, 연결/발송·수신 여부는 별도 백엔드 온보딩이 필요하다.
- 각 토픽에 자동발행이 없고 이메일/문자/웹푸시 옵션이 비활성화된 경우에는 실패로 단정하지 않고 **설정 필요/실증 불가**로 구별한다.

## 화면 및 API

- 기존 최고관리자 `https://ekodi.kr/admin/` 내 **소통·알림·메시징 > 알림** 탭. `GET /api/notifications/admin/summary?window=7d|30d|all`의 기존 응답과 인증 경계 유지.
- 최고관리자에만 추가되는 항목:
  - `fleet.counts` 및 `fleet.sites`: 등록부 총수, 토픽 연결/미연결, 발행 준비/미완료, 계획/은퇴 등 제외 사유, 정본 경로별 개선 안내.
  - `operatorChannel`: VAPID 키 준비 여부, 사설 운영자 장치 등록 대수, 실제 기기 수신은 별도 검증.
- 기존 토픽별 `health`, `diagnosis`: `attention`(15분 초과 지연·전송 실패), `configuration_required`, `unverified`, `delivery_queue_clear`. 'delivery_queue_clear'는 실제 단말 수신 확인이 아니다.
- 사이트 관리자/조직 관리자에게 `fleet`·`operatorChannel`은 **반환하지 않는다**. 본인 토픽의 기존 집계만 제공한다. 익명/비인증 403.
- 모든 항목은 읽기 전용. 수신기 토큰, 전화번호, 알림 본문, 이용자별 기록, 인증키, 원본 개인정보를 집계 응답에 담지 않는다. 외부 사이트/쿼리 포함 주소는 등록부 진단에서 제외한다.

## 적용 완료 기준: 단계별

1. **가시화**: 이번 소스 변경의 테스트, 오케스트레이터 보호 CI, 스테이징, 운영 배포, 관리자 모바일/데스크톱 실제 화면 확인, 실서버 API 403/200과 누락 사이트 표시.
2. **실제 모든 사이트 연동**: 공통 인증된 Workspace 실원장 기반 동적 사이트 포함; 각 소유 서비스 Worker의 전용 키/허용 스위치 기반 서버측 이벤트 발행; 본인 사이트 권한 격리. 전 서비스 자동 발송은 소유자 승인과 고객 수신 동의 없이 활성화하지 않음.
3. **최고관리자 휴대전화 실증**: `/mail/admin` 운영자 사설 푸시에서 기기 등록·VAPID 확인; 신청 이벤트의 서버측 트리거, 멱등 재시도, 해당 관리자 기기까지 수신 증빙. 웹푸시 수신 동의를 받은 기기만 발송.
4. **운영개선 자동화**: 15분 이상 처리 지연, 설정 누락, 실패율 임계 초과를 중앙 모니터링과 연결하고 담당자 승인 경로의 안전한 재처리만 허용. 공개 Web Push/대규모 발송·금전 트랜잭션 자동 활성화 금지.

## 점검 명령

```sh
node --check notification-control.js
node --check notification-admin-summary.js
node --check notification-fleet-coverage.js
node --check communication-admin.js
node --test test/notification-fleet-coverage.test.mjs test/notification-admin-summary.test.mjs test/notification-tenant-scope.test.mjs test/notification-publisher-isolation.test.mjs test/operator-push.test.mjs
```

보호 CI와 오케스트레이터 공식 릴리스 후에만 운영 완료 판단. 비활성 알림 채널, 공급사 결제, 사용자 계정 및 다른 사이트 RLS는 변경하지 않는다. 리디렉션도 신설하지 않는다.

## 2026-11-21 후속 — 운영자 휴대전화 푸시 실기기 시험 기능

- 로그인 후 `https://ekodi.kr/mail/admin#setup` > **휴대폰 운영 알림**에서 본인이 승인한 브라우저의 푸시 구독을 등록하고 **휴대전화 알림 시험** 버튼으로 제한적 시험을 요청한다.
- 서버: `POST /api/mail/control/operator-push/test`. 인증된 Supabase 사용자, 이메일 검증 완료, 서버측 `OPERATOR_PUSH_EMAILS` 허용명단, 정확한 `https://ekodi.kr` Origin, `AUTH_RATE_LIMITER`, 최근 발송 120초 보호를 모두 검사한다.
- 발송 대상은 현재 인증된 운영자 이메일로 등록된 푸시 장치만이며, 전체 운영자에게 시험 알림을 발송하지 않는다. 기존 정상 운영 `OperatorNotifier`가 전체 관리자에게 보내는 본래 동작은 유지한다.
- 시험 알림은 고정 문구와 `/mail/admin` 링크만 담는다. 고객정보, 업체명, 영수증/계약조회 토큰, 이메일, 기기 endpoint, auth secret은 알림에 넣지 않는다.
- HTTP 성공은 **Web Push 게이트웨이 수락**일 뿐 기기 수신·열람을 증명하지 않는다. 운영자는 기기의 실제 알림 노출을 직접 확인해야 한다.
- 기존 `GET /api/mail/control/operator-push`에는 해당 운영자 계정의 집계(장치수/마지막 시도/최근 장치별 결과)만 추가한다. 통합 최고관리자 `/api/notifications/admin/summary`에도 전체 운영자 기기 집계가 추가된다. 둘 모두 개인정보와 endpoint는 반환하지 않는다.
- VAPID가 미구성, 등록 기기가 0, 발송 쿨다운, 관리자 인증 실패 등은 명시적으로 미준비/거부 상태를 돌려주며 공개 Web Push 전역 스위치나 일반 사이트 고객 수신 동의를 수정하지 않는다.
- 실제 운영 확인: 보호된 공식 CI와 오케스트레이터 복구 PR 병합, Control API·Site Core/Mail Admin 정확한 릴리스, 익명/타인 401·403, 운영자 기기 등록과 시험 결과, 잠금화면 수신의 독립 확인. 실기기 수신 근거 없이는 성공 보고 금지.

새 검증 명령:

```sh
node --test test/operator-push-probe.test.mjs test/operator-push.test.mjs test/notification-admin-summary.test.mjs
```

## 2026-11-21 후속 — 통합알림 자동건강 점검 원장

**기능 경계:** 기존 Control API의 10분 주기 Cron(새 Cron/Worker 생성 없음)을 이용해 현재 연결된 7개 주제의 발행 준비, 구독 기기 수, 최근 24시간 이벤트와 전송 실패, 현재 지연된 전달 및 발행을 읽는다. 각 주제 최신 점검만 `notification_health_snapshots`에 저장한다. 고객 이름·구독 주소·전화번호·알림 내용·인증값·브라우저 토큰은 수집하지 않는다.

**지속성:** 추가 마이그레이션 `migrations/202611210730_notification_health_snapshots.sql`. Cron은 미반영 배포도 안전하게 시작할 수 있도록 같은 `CREATE TABLE IF NOT EXISTS`를 사용한다. 최고관리자 조회 경로에서는 스키마 수정하지 않고, 준비 안 된 경우 `unavailable`로 표시한다.

**자동 판정(순서대로):**
1. `attention`: 최근 24시간 실패, 15분 초과 지연 전달/발행 중 하나 이상 발견. 위험 연속 진단 횟수를 누적한다.
2. `configuration_required`: 해당 주제의 독립 발행 활성화 또는 서버 전용 비밀키가 준비되지 않음.
3. `unverified`: 구독 기기 또는 지난 24시간 발생 이벤트가 없어 전송 실적을 검증할 수 없음.
4. `push_paused`: 명시적인 전역 Web Push 비활성 상태. 상태를 고장으로 단정하지 않는다.
5. `queue_clear`: 적재된 통계 기준 대기열 위험이 없음. **휴대전화 수신·열람 또는 단말 네트워크 연결 증거가 아님.**

**표시 위치:** 최고관리자 `https://ekodi.kr/admin/`의 *소통·알림·메시징 → 알림*. `GET /api/notifications/admin/summary`의 기존 최고관리자 전용 응답에 `healthAudit` 추가. `lastScanAt`, `fresh` (30분 이내), `status`, `topics[].consecutiveAttention`, `changedAt`을 제공한다. 사이트 관리자는 다른 주제·운영자 사설 기기·전체 스냅샷을 열람할 수 없다.

**주의:** 현재 주제 매핑은 7개뿐이며 동적 고객 사이트는 중앙의 미연결 목록에만 표시될 수 있다. 새 사이트에 알림 발행권한이나 자동 수신 동의를 생성하지 않는다. 이 상태 점검은 별도의 실서비스 HTTP 가동검사, 정식 배포 영수증, 실제 휴대전화 푸시 시험과 다르다.

**배포·검증 명령:**

```sh
node --check notification-health-audit.js
node --check notification-admin-summary.js
node --check mission-control-entry-worker.js
node --check communication-admin.js
node --test test/notification-health-audit.test.mjs test/notification-health-audit-wiring.test.mjs test/notification-admin-summary.test.mjs
```

공식 오케스트레이터 보호 CI → 스테이징/배포 버전 → 실제 D1 스냅샷 2회 연속 점검과 관리자 접근 제어까지 검증한 후 실운영 완료 판정. 자동 고객 웹푸시, 운영자 추가 발송, 유료 SMS/알림톡, PG 활성화, 고객 그룹간 발행 권한 공유를 수행하지 않는다.
