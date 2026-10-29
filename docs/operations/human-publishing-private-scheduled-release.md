# EKODI Human Publishing — 비공개 완성도서 등록 및 예약 동시공개 계약

**총괄 지휘:** EKODI Orchestrator. **소유 서비스:** 에코디출판.
**관리:** #6331 (공통 출판), #6522 (희년신학 시리즈), 구현 검토 PR #6638.
**권한 경계:** 공개 노출 전용 소비자 = 에코디서점 (`https://ekodi.kr/books`), 에코디몰 (`https://ekodi.kr/ekodimall`). 출판 원본과 비공개 승인 자료는 에코디출판 단독 관리.

## 단계별 실제 동작 계약

1. **집필·제작 완료 → 비공개 등록** — 정본 DOCX, EPUB, 커버, 메타데이터를 출판사 **비공개 보관소**에 저장하고 실제 파일 존재, 정본 SHA-256, 저작물 소유·승인 기준을 서버에서 확인. `registerCompletedEdition`이 `private_registered`를 생성한다. 판매 카탈로그에는 넣지 않는다.
2. **공개일정 설정** — 저자·출판자 최종승인 및 권리·EPUBCheck/Ace·실제 기기·결제와 구매권한 검증이 끝나면, 최고관리자 또는 출판 권한자만 `2026-11-15T09:00:00+09:00`처럼 **명시적 한국시간 오프셋**으로 일정 입력. 날짜 예시는 실제 예약이 아니다. `scheduleApprovedEdition`에서 **정본 해시와 쌍방승인 검증**; 원본 수정 시 재승인 필수.
3. **예약시각 도래** — 인가된 백엔드의 정기 작업(기본 5분 단위 제안)이 전용 비공개 D1에서 기한 도래 항목을 조회. 원고 해시·저자·출판 승인·권리 유효성을 **한 번 더 확인**한다. 무인 작업 자체에는 출판 승인을 부여할 권한이 없다.
4. **2채널 비공개 준비** — 서점과 몰에 동일 `publicationId / editionId / releaseDigest`를 내보내며 양쪽 모두 **공개 전 보이지 않는 상태**로 준비. 서비스별 확인 영수증과 공통 멱등키를 유지하고, 어느 한 곳이 실패하면 **둘 다 비공개**로 유지한다.
5. **동시 활성화·중앙 공개 허가** — 두 채널이 각각 준비와 활성화 성공을 신뢰 가능한 서버 간 서명 응답으로 확인하면 중앙 공개 승인 플래그를 `released`로 전환. 각 채널은 **진열·검색·가격 제시·구매 버튼·파일 다운로드의 모든 사용자 접점**에서 공통 공개 허가 여부를 다시 검사한다. 중앙 허가를 조회할 수 없으면 비공개로 취급한다. 일부 화면 캐시·검색엔진 색인은 별도 무효화/반영 지연이 있을 수 있으므로 ‘완전히 동시 노출’이라는 허위 보장은 하지 않는다.
6. **실패·취소·수정** — 불일치나 오프라인이면 대기 상태 보존 → 같은 멱등키로 재시도 → 관리자 알림·감사. 결제/판매 실행 전까지 일정 취소 가능. 공개 후 판매 중지는 별도 철회/환불 프로세스이며 단순 재예약으로 처리하지 않는다.

## 구현된 코드 (승인 전 PR의 비활성·검증용 구성요소)

- `publishing/human/scheduled-release.js`: 완성 비공개 등록 → 저자·출판자 정본 서명 승인 → 예약 → 채널별 준비/활성화 → 양쪽 영수증 확인 → 공동 공개 허가. 모든 전이 fail-closed.
- `publishing/human/private-release-store.js` 및 `sql/001_private_scheduled_editions.sql`: 출판사 소유의 별도 D1 비공개 장부. 낙관적 revision-CAS와 공개 전 `checkout_enabled=0` SQL CHECK.
- `publishing/human/scheduled-release-runner.js`: 만기 대기열 재시도와 채널별 단계적 확인. *별도 정기 실행 등록·신뢰 채널 어댑터·보호 서명 검증이 없으면 실행되지 않음*.
- `test/human-publishing-scheduled-release.test.mjs` 및 `test/human-publishing-private-release-store.test.mjs`: 승인 누락·잘못된 시간·경합·한 채널 장애·재시도·두 채널 연동 테스트. 기존 출판 CI에 결합.
- `publishing/jubilee-series/draft-registry.json`: 현재 **희년신학 시리즈 2권은 최종 감수 전이므로** 완료 원고로 허위 등록하지 않고 비공개 검수 메타데이터만 유지. 실제 공개 일정 미정.

## 아직 필요한 운영 인계(이 PR에서 의도적으로 미활성화)

- [ ] 독립된 출판사 전용 D1 DB 생성, 비공개 migration 공식 보호 실행 및 감사.
- [ ] 저자·출판자 서명의 인증과 승인 해시를 검증할 수 있는 **서버 전용** 인증 API 및 파일 보관소 binding.
- [ ] 오케스트레이터 서명/인증을 통과한 운영 cron 배치, **현재 구현한** 트랜잭션 outbox의 검증된 배포·소비자·장애 재시도·경고.
- [ ] 서점·몰 **양쪽 모두** 신규 수신 adapter와 중앙 공개 허가 검사를 모든 상품 표시·결제·검색 진열 경로에 연결. 중앙 비공개 여부와 관계없이 기존 공개 도서의 판매는 보존해야 한다.
- [ ] 실제 고객과 별도 격리된 staging에 2채널 E2E, 결제/환불/구매권한 검증. 소스 정확 SHA의 필수 CI, Human Gate, 보호 병합 및 운영 배포 검증.
- [ ] 기존 유통계약, 성경 번역·외부 표지 사용권, ISBN·정가/할인/취소·환불 정책 검수.

**주의:** 본 PR은 파일·상태 전이·테스트를 제공하지만, 아직 운영용 예약 출판 API·스케줄러·두 소비 서비스 연동의 최종 배포를 의미하지 않는다. 두 권의 원고 자체를 공개 Git 저장소에 업로드하지 않는다. 기존 `books/books.json` 및 결제 활성화 상태는 변경하지 않는다.


## 관리자 화면 및 비공개 API 계약 (추가 구현, 아직 비활성)

- 관리자 화면 소스: `publishing/private-releases/index.html`, `private-releases.js`. 실제 운영 게이트웨이에서 확인해야 할 표준 진입 URL은 `https://ekodi.kr/publishing/private-releases/`. 이 경로는 **아직 실서비스에서 검증·배포되지 않았으며 링크만으로 기능을 증명하지 않는다.**
- 출판 Worker 라우터: `publishing-worker.js`의 내부 경로 `/api/private-releases` (중앙 정규 경로는 `https://ekodi.kr/publishing/api/private-releases`; 라우터가 `/publishing`을 제거하여 전달). `PUBLISHING_PRIVATE_RELEASE_ENABLED`가 문자열 `true`가 아니면 404, 필수 결합 서비스가 하나라도 빠지면 503. 이 기능은 기존 예약도서·카탈로그에 영향을 주지 않는다.
- 읽기: `GET /api/publishing/private-releases` (비공개 등록된 전체 작품 목록), `GET /api/publishing/private-releases/:editionId`, `GET /api/publishing/private-releases/csrf`. 읽기까지 출판 권한 인증이 필요하다.
- 쓰기: `POST /api/publishing/private-releases/register` with `{"editionId":"..."}`; `POST /api/publishing/private-releases/:editionId/schedule` with `{"revision":2,"publishAt":"2026-11-15T09:00:00+09:00"}`; `POST /api/publishing/private-releases/:editionId/cancel` with `{"revision":3,"reason":"..."}`. 날짜는 단순 예시. 일정 변경마다 optimistic CAS 적용, 이전 revision은 거절한다.
- 인증: `PUBLISHING_RELEASE_AUTH.verifyRequest`는 서버 세션·`publishing.private-release.{read,register,schedule,cancel}` 세분 권한·same-origin/anti-CSRF를 확인하는 신뢰된 출판 전용 RPC. 관리자 이메일 문자열을 클라이언트에서 비교하는 방식 금지. `issueCsrf`는 인증된 요청에만 서버가 토큰을 발급하며, 브라우저의 저장소에 인증정보를 남기지 않는다.
- 파일·승인: `PUBLISHING_RELEASE_VERIFIER.loadCandidate`, `verifyCompletedFile`, `verifyApprovalEvidence`, `verifyChannelAck`는 출판사 서버만 보유하는 검증 RPC. 요청 본문에 전달한 서명 유효 플래그/가격/파일위치는 무시. 승인 후보 판본 해시와 비공개 파일·저자/출판자 서명을 직접 대조해야 한다.
- 감사·송신함: 새 `publishing/human/private-release-atomic-ledger.js`는 출판 전용 D1 `batch()`로 **상태 변경 + 배우자/관리자 식별 감사기록 + 비공개 outbox**를 원자적으로 기록한다. `sql/002_private_release_audit_outbox.sql`을 001 뒤에 적용해야 한다. 실제 메타데이터 외 고객 정보·원고 전문·서명 증빙은 outbox에 넣지 않는다. 운영 환경의 D1 트랜잭션·CAS·outbox 소비자·복구 절차 검증은 여전히 필요하다.
- 예약 실행: `publishing-worker.js`에 `scheduled()`를 추가했지만 **Wrangler cron 트리거는 추가하지 않았다.** `PUBLISHING_PRIVATE_RELEASE_ENABLED=true`와 서명된 채널 RPC 및 독립 저장소가 모두 있을 때만 `runConfiguredPublishingReleaseTick`이 수행된다. 별도 검토된 배포 작업으로 격리 staging과 실제 일정 실행 테스트를 통과해야 운영 cron을 설정할 수 있다.

### 완료됐다고 주장할 수 없는 운영 항목
`PUBLISHING_RELEASE_DB`, `PUBLISHING_RELEASE_AUTH`, `PUBLISHING_RELEASE_VERIFIER`, `PUBLISHING_RELEASE_CHANNELS` 서비스 바인딩은 **이번 PR에서 실제 발급/설정하지 않았다.** Books/Mall의 진열·검색·가격·결제·파일 다운로드 진입점은 아직 신설 출판 판본의 중앙 공개 승인을 호출하지 않는다. 그러므로 이 두 채널에 신규 도서를 인계하거나 공개할 수 없다. 기존 판매 도서는 변경하지 않았다.

### 중앙 라우트 실증 계약

`platform-route-registry.js`의 `/publishing` 서비스 바인딩은 요청을 출판 Worker로 전달하기 전에 해당 접두어를 제거한다. 따라서 화면 `/publishing/private-releases/`는 Worker의 `/private-releases/`, API `/publishing/api/private-releases`는 Worker의 `/api/private-releases`에 대응한다. 반면 브라우저의 `Origin`은 `https://ekodi.kr` 그대로이므로, 출판 API는 보안 검사에 정규 Apex Origin을 사용한다. 이 경로는 `test/human-publishing-canonical-release-route.test.mjs`에서 회귀 검증한다.

## 원자적 감사·배포 대기 장부 (추가 구현)

- `publishing/human/private-release-atomic-ledger.js`: 등록과 상태 변경이 승인된 단일 D1 `batch()`에 포함됨. (1) 등록/상태변경, (2) 변경자·판본·revision 감사, (3) 오케스트레이터가 읽는 최소 메타데이터 outbox를 **한 트랜잭션에서** 생성한다. D1 batch가 없으면 변경은 거부.
- `publishing/human/sql/002_private_release_audit_outbox.sql`: `publishing_release_audit`과 `publishing_release_outbox`만 생성. 기존 사용자·몰·서점 DB를 변경하지 않으며, 001 이후 보호된 DB 마이그레이션 필요.
- `publishing/human/private-release-api.js` 및 `scheduled-release-runner.js`: 새 원자적 장부에 연결. 저자·제목·정본 해시·정본 생성 식별자는 같은 판본의 이력 중 변경할 수 없다. 변경 시 새 판본 생성과 재승인이 필요하다.
- `test/private-release-sqlite-test-support.mjs`, `test/human-publishing-private-atomic-ledger.test.mjs`: SQLite 트랜잭션/중복·동시 수정·권한 없는 변경·롤백을 검증. 기존 관리자 API/예약 재시도 테스트 역시 원자적 장부와 연동하여 수행.
- 아직 운영 DB를 만들거나 `002` 마이그레이션을 적용한 것은 아니다. 기존 판매 서비스에 대한 자동 릴리스 outbox 소비도 개통하지 않았다.

> 판본 상태가 `released`여도 신규 도서 공개는 에코디서점·에코디몰의 각 사용자 접점이 보호된 중앙 공개 승인 조회를 실제로 시행할 때만 가능하도록 해야 한다. 이 두 판매 채널의 운영 수신·검색·결제 차단 연결은 별도 최종 검증 항목이다.
