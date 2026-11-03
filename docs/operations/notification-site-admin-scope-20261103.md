# EKODI 알림: 사이트 관리자별 자기 사이트 조회 (2026-11-03)

## 구현 범위
- 기존 `GET /api/notifications/admin/summary`는 최고관리자 D1 세션의 전체 조회를 유지한다.
- 일반 사이트 관리자는 서버에서 **Supabase /auth/v1/user 인증 및 current_site_activity_contexts RPC**를 모두 확인한 경우에만 집계 조회를 허용한다. 클라이언트가 보낸 역할, URL, 사이트 이름, 헤더만으로는 권한을 부여하지 않는다.
- `tenant_id`가 있는 사이트 권한 원장의 승인된 관리 역할만 통과하며, 현재 검증된 맵핑은 `ekodi-church`/`ekodichurch` → church 및 `ekodimission` → mission이다.
- 한 사용자가 둘 모두 관리하는 경우 서버가 확인한 두 토픽만 `all`에 반환한다. 다른 주제 요청은 403이다. 승인되지 않은 역할, 미확인 이메일, 원장 응답 오류/없음, 매핑되지 않은 사이트는 403으로 닫는다.
- 집계는 활성 구독 **기기 수**, 이벤트 및 전송 상태의 합계만 보여준다. 기기 토큰, 푸시 주소, 본문, 개인 식별정보, 관리자 이메일은 출력하지 않는다.
- 에코디교회·에코디선교회 기존 사이트 관리자 **서비스설정** 화면 아래쪽에 읽기 전용 알림 현황을 붙인다. 새 관리자 메뉴·별도 로그인 화면을 만들지 않는다. 사이트 화면은 자기 토픽만 요청하고 다시 서버가 검증한다.
- 현재 제공하지 않는 다른 사이트(몰·출판·교육·지역 등)는 서버 권한 매핑 검증 없이 임의로 확장하지 않는다.

## 관련 가드레일
- Supabase 검증 실패 시 신뢰되지 않은 JWT 내용을 자체 해석해 허용하지 않는다.
- 최고관리자 D1 조회는 기존 권한 원장으로만 유지한다.
- 운영 알림 자동발행, VAPID 푸시, 마케팅 발송, 구독 동의와 관련된 플래그/비밀키는 이번 변경에서 건드리지 않는다.
- 사용자별 알림 구독·발송 원장을 다른 관리자가 검색할 수 없다.
- 실제 사람에게 전달/열람했다는 뜻으로 서버 전송 처리 건수를 표시하지 않는다.

## 빌드 및 검증
`node --test test/notification-tenant-scope.test.mjs test/tenant-notification-admin-ui.test.mjs test/notification-admin-summary.test.mjs test/notifications-core.test.mjs test/admin-communication.test.mjs`.
`node --check notification-admin-authority.js`, `node --check workspace-admin-page.js`, `npm run build`, `node scripts/validate-additive-migrations.mjs`, `node scripts/validate-service-layer-boundaries.mjs`.

서버와 브라우저에서 사이트 관리자 역할/토픽 교차접근을 검증한 뒤 EKODI 공식 릴리스 절차로 배포해야 한다. 승인·권한 전환과 실제 발송 활성화는 다른 통제 절차다. 원본 작업 PR 병합은 금지하며 공식 보호 복구 PR과 진짜 CI/스테이징/운영 검증이 필수다.
