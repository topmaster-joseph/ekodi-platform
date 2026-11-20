# EKODI 통합알림 전체 사이트 점검 — 2026-11-21

중앙 이슈: [#9957](https://github.com/topmaster-joseph/ekodi-platform/issues/9957)
소스 작업 브랜치: `ai/chatgpt/notification-fleet-coverage-20261121`

## 운영 목표 및 진실성 기준

- 최고관리자 `소통·알림·메시징 > 알림`에서 *등록된 모든 기존 Workspace 사이트와 서비스*의 알림 주제 연결 상태, 서버 발행 준비, 시간창별 이벤트·대기·실패·지연, 최고관리자 사설 웹푸시 장치 등록 현황을 통합 조회.
- 등록부 출처는 `config/site-lifecycle-registry.json`과 `config/ecosystem-services.json`. 동일 정본 경로는 하나로 집계하고 retired/archive-only와 planned는 별도 집계.
- **등록부에 존재함, 토픽에 연결됨, 발행 서버가 구성됨, 전달 큐가 완료됨, 최종 휴대전화가 수신함**은 서로 다른 상태다. 마지막 단계는 현장 기기 검증 없이는 성공으로 표시하지 않는다.
- 신설 고객의 **동적** Workspace 사이트는 기존 두 정적 등록부에 없을 수 있으므로 현 단계 목록으로 "100% 모든 사이트"를 보증하지 않는다. 추후 인증된 실제 Workspace 등록원장을 결합해야 한다.
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
