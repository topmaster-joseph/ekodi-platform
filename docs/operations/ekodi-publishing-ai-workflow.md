# EKODI PUBLISH-PIPELINE-001 — AI 집필·검수·승인·예약등록·통합판매

Owner: independent EKODI Publishing. Controller: EKODI Orchestrator. Issues #6331 / #6557 / #6590.
Status: protected PR, unprovisioned workflow DB, unmerged, unlaunched.

## Data and authority boundaries
- /publishing/human/manage/ is an editorial publication-candidate workflow, not a duplicate personal writer profile or private manuscript storage.
- Existing Creator AI (author/) owns source manuscripts, conversational writing, user subscription and plan quotas. The publisher holds only author identity reference, edition/manuscript SHA-256 digests, review evidence, status, schedule and audit. Do not put manuscript text or contracts in a public repo.
- The AI queue only registers author-consented ZERO-cost requests; it does not call an AI model or report drafted text as finished. Actual work requires a signed EKODI Orchestrator connector to Creator AI, source-ownership verification and subscription/rights checks.
- Independent publisher-owned Cloudflare D1 PUBLISH_DB is mandatory. A missing binding returns 503. Never share the bookstore private DB or assume its tables and buyer credentials.
- Editor/publisher roles require backend grants. Admin cannot impersonate the author's individual approval. EKODIAN fictional manuscripts remain under #6557 and cannot be auto-imported into the general Human Publishing lane.

## Editorial workflow
planning → drafting → in_review → ready_for_author → author_approved → publisher_approved → scheduled → handoff_ready.
changes_requested leads back to drafting; any content change must invalidate former approvals and scheduling.
- Every approval is bound to the exact immutable edition SHA-256. The shared human/editorial release policy enforces rights, readability, legal and two-channel commerce QA.
- Reservation uses a future UTC date converted from Asia/Seoul. A due reservation proposes an event with deliveryState=not_dispatched; it does NOT open live sale, update a catalog, charge a buyer or send an unverified product to the mall.
- User-initiated release_receipt API is always forbidden. Future signed dual-channel dispatch must independently verify both bookstore and mall receipts on the exact edition digest before marking released.

## Protected deployment and completion requirements
1. Provision independent publisher-owned D1 and an isolated staging binding PUBLISH_DB. Apply migrations/202610291000_publishing_workflow.sql in staging first. Only after authorized backup, schema reviews and protected release should the production binding be set.
2. Grant reviewer/publisher user IDs via separate privileged audited role grant. Never derive roles from a client email, query parameter or localStorage.
3. Test authenticated create→revision→editor review→author approval→publisher QA→schedule as different identities; negative tests for missing author consent and nonowner access. Validate /publishing/api/workflow/health, 401, 403 and 503.
4. Integrate private Creator AI with its verified entitlement/author-source API. No unapproved paid AI API, billing, subscription mutation or client-provided operator tokens.
5. Attach immutable private manuscript, EPUB 3 and cover assets and confirm EPUBCheck, Ace, reading order, ISBN/납본 applicability, licenses and physical device readers. Browser-supplied QA flags and hashes are only review notes until attested against storage.
6. Build signed transactional outbox from Publishing to independent Books and EKODI Mall receivers with idempotency, product/price parity, verified buy status, safe retry/rollback and independently signed acknowledgments.
7. Protect existing Volume 1, current two bookstore catalog titles, prices, payments, purchase rights, refunds, seller contracts and open PRs; do not change any of them in this PR.
8. Complete required CI, isolated staging, owner Human Gate, protected merge, post-merge production probes and real checkout/refund tests before saying that a release is commercially operational.

## Unfinished
- D1 not provisioned; actual AI writing runner, private source connector, EPUB production, signed release dispatch, commercial booking scheduler and production UI not activated.
- Legacy /publishing/studio/ still uses old host-based API and login URLs; it must migrate to canonical apex subpaths in a separate protected task.
- Up to six monthly discipline slots remain planning targets, NOT automatically published books.

## Verification
node --test test/publishing-workflow.test.mjs test/human-publishing-monthly.test.mjs
node --check publishing-workflow-api.js
node --check publishing/human/manage/app.js
node --check publishing-worker.js


## 2026-10-29 추가: 무료/유료/최고관리자 출판 및 보너스 오디오북 강제 게이트

- 모든 저자는 무료 AI 영감 코칭과 비공개 개인 원고 보관 경로를 사용할 수 있다. **무료회원은 출판사 편집심사 제출부터 서버에서 차단**한다.
- `publishing/release-entitlement.js`는 기존 Supabase `human_author_subscriptions`를 Worker 전용 `PUBLISH_SUBSCRIPTION_READ_KEY`(운영 비밀키, 미설정)로 읽어 `writer1`/`writer3` 가입상태, 결제검증일, 유효기한을 확인한다. 회원등급을 클라이언트로부터 신뢰하지 않는다. 조회 불가·취소·만료는 실패 차단.
- 최고관리자 출판편집 예외는 보호된 ID 목록 `PUBLISH_CHIEF_AUTHOR_IDS`와 독립 출판 DB `publishing_workflow_roles.role='admin'`을 **동시에** 요구한다. 이메일 비교나 클라이언트 입력으로 최고권한을 부여하지 않는다. 관리자도 저자의 원고 승인에 서명할 수는 없다.
- 모든 판매 도서의 발행자 승인·예약·예약일 인계 후보 생성 전에는 판본별 `publishing_workflow_release_contracts`의 양측 서명·출판 이용허락과 유료회원의 인세·수수료 합의를 검토한다. 인세율/수수료율은 임의 산정하지 않는다.
- `publishing_workflow_audio_release_qa`에는 무료 보너스 가격 0원, 고급음성 라이선스, 대사·전체 트랙 QC, 구매권한, 환불철회, 음원 SHA-256, 검수 담당자·일시가 필요하다. 하나라도 미승인 시 판매 예약 불가.
- 두 QA 테이블의 데이터는 별도 보호된 출판 운영자/증빙 경로에서만 기록된다. **일반 사용자 화면에는 계약·오디오 검수 통과 값을 작성하는 API가 없다.** 현재 코드는 검수 기록을 확인할 뿐 실제 음원·서명 계약이 생성됐다고 보장하지 않는다.
- `GET /publishing/api/workflow/projects/{id}/readiness`는 로그인한 저자 또는 편집자에게 미완료 사유만 반환하고 계약 원문이나 구독 비밀키는 반환하지 않는다. 사용자 화면의 '판매 준비조건 확인' 버튼으로 조회.
- **운영 미완료 조건**: 출판 독립 D1, 서버 구독조회 비밀키, 최고관리자 ID의 실증, 계약/오디오 검수 기록, MP3 실물, 기존 Creator AI 연결, 서점·몰의 서명된 판매 인계. 이 항목이 없으면 `publisher_approve`, `schedule`, `prepare_handoff`는 모두 차단된다.
- 실제 발행자 서명·음원 SHA·서버 상거래 증빙을 독립 검증하지 않은 체크박스 기록만으로 도서가 공개될 수 없게 별도 상업용 인계 서명 경로를 계속 구축해야 한다.

검증: `node --test test/publishing-release-entitlement.test.mjs test/publishing-workflow.test.mjs test/publishing-workflow-api.test.mjs`. 모든 작업은 보호 PR #6679의 최신 SHA에 대해 검증해야 한다.
