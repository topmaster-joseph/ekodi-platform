# EKODIBIZ AI 위탁계약 신청 → 최고관리자 사설 푸시

중앙 이슈: [#9957](https://github.com/topmaster-joseph/ekodi-platform/issues/9957)
기존 AI 위탁 서비스: `/ekodibiz/ai-agency/apply` / `/manage`

## 구현
- **신청서가 Durable Object에 성공적으로 저장된 직후** 기존 EKODI Control API의 내부 Worker RPC `OperatorNotifier`를 통해 최고관리자 등록 기기에 푸시 요청. 공개 사용자 경로/브라우저에서 알림을 발행하지 않음.
- 비공개 알림에는 신청 유형과 검토 대기만 포함. **고객명, 이메일, 기관명, 공급사, 신청번호, 결제 정보, 조회 비밀토큰, 외부 인증 비밀번호 미포함**.
- `ctx.waitUntil()`으로 알림과 고객의 201 접수 결과를 분리. 알림 전송 실패는 이미 저장된 신청을 취소하지 않으며 서버 쪽 PII 없는 경고 코드만 기록.
- 신규 전용 제어 플래그: 운영 `AGENCY_OPERATOR_NOTIFY_ENABLED=true`; 스테이징 `false`이며 실운영 최고관리자 기기로 알림을 보내지 않음. 운영에서는 `wrangler.ekodibiz.toml` 전용 서비스 바인딩 `OPERATOR_NOTIFY`→`ekodi-auth-api`의 `OperatorNotifier`.
- 기존 `operator-notify.js`에 **신뢰된 `agency`** source를 추가. 일반 공개 Web Push, 전체 사업장 발송, Gmail 발송 기본 비활성, 수신자 사설 기기 구독, VAPID 권한 및 재정 게이트는 변경하지 않음.

## 안전/검증 조건
- 테스트: `node --test test/ekodibiz-agency-operator-notice.test.mjs test/ekodibiz-ai-agency.test.mjs test/operator-notify-entrypoint.test.mjs test/operator-push.test.mjs`.
- `node --check ekodibiz-ai-agency.js ekodibiz-worker.js operator-notify.js`.
- EKODI 오케스트레이터 공식 PR, 양쪽 Worker (Control API → EKODIBIZ) 보호 CI/스테이징/운영 배포의 버전과 시간/원본 SHA를 별도로 확인.
- 운영 `/api/agency/health` 및 실제 생성 없는 보호 검증을 우선. 실제 신청 이벤트에 대한 운영자 기기 푸시 최종 수신은 **본인 명시적 구독/실기기 테스트 완료 후에만 성공 표시**.
- 알림 전송 201은 *수신 성공*이 아님. 기기 미등록/VAPID 부재는 `NO_OPERATOR_CHANNEL` 등의 실패로 구분.
- 향후 운영 견고화 과제: DB 원장에 멱등 전송 큐/실패 재시도 및 관리자 미확인건 집계. 이 단계는 단순한 event dispatch이며 통합알림의 전 사이트 발송 보장을 의미하지 않음.

## 롤백
해당 비공개 알림만 멈추려면 운영 플래그를 `false`로 하고 보호된 릴리스 절차에 따라 배포. 기존 신청/결제/고객 기록은 그대로 둔다.
