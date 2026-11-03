# EKODI 알림 운영 현황 — 기간별 모니터링 (2026-11-03)

## 기능
- 공통 최고관리자 **소통·알림·메시징 > 알림** 탭과 사이트별 관리자 **서비스설정 > 알림 운영 현황**에 동일한 기간 선택: `7d`(최근 7일, 기본), `30d`, `all`(전체).
- 서버 API `GET /api/notifications/admin/summary?topic=<allowed>&window=7d|30d|all`. 기존 플랫폼 전체 조회와 Supabase 실명 검증 기반 사이트·주제 격리 정책을 그대로 재사용.
- **현재 구독 기기** 수는 현재 활성화된 기기를 의미하며 기간 필터를 받지 않는다. 이벤트 및 배달 상태 건수는 `notification_events.created_at`에 대한 기간별 코호트 집계다.
- `eventsOverdue`: 예정 시각이 15분 이상 지난 대기 중인 이벤트.
- `stalled`: 다음 처리 시각이 15분 이상 지난 대기 중인 배달이나 잠금 시각이 15분 이상 지난 처리 중인 배달.
- `lastEventAt`, `lastDeliveredAt`은 집계된 기간 안의 최근 시각만 반환한다. UI는 `Asia/Seoul`의 로컬 표시를 사용한다. 구독 정보·기기 토큰·푸시 endpoint·본문·개별 수신자는 열람할 수 없다.
- 웹푸시 여부는 서버에서 계산된 `webPushEnabled`만 표기한다. 이 UI는 자동발행이나 웹푸시 발송 설정을 변경하지 않는다.

## 정확한 해석
- `delivered`는 서버의 전달 처리/푸시 사업자 접수 결과이지 사용자가 실제 읽었다는 뜻이 아니다.
- `eventsOverdue`나 `stalled`이 0이어도 푸시 발송이 활성화됐다는 뜻은 아니다.
- 서버가 알림 지연을 관측할 뿐 자동 재시도 정책·재전송 버튼·인증 키는 새로 추가하지 않았다.
- 인증 없는 호출, 유효하지 않은 기간, 타 사이트의 주제 조회는 거부한다.

## 필수 검증
`node --test test/notification-admin-summary.test.mjs test/notification-tenant-scope.test.mjs test/tenant-notification-admin-ui.test.mjs test/notifications-core.test.mjs test/admin-communication.test.mjs`
`npm run build`, `node scripts/validate-additive-migrations.mjs`, `node scripts/validate-service-layer-boundaries.mjs`.

공식 EKODI Orchestrator 보호 릴리스, 실제 Control API/사이트 Worker 배포, 운영의 비인증 403·공개 페이지 200·기간별 UI 확인까지 마쳐야 완료로 인정한다. 테스트용 사용자 구독은 실제 발송 없이 생성·조회·해지해야 한다.
