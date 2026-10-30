# 출판 승인 워크플로 ↔ 비공개 예약출판: 검증된 판본 계약

**Task:** `chatgpt-6331-verified-workflow-bridge-20261030` · EKODI Orchestrator / central issue #6331

## 해결하는 실질 인터페이스 차이

독립 작업인 집필/편집/발행자 승인 Draft #6679는 원고 판본을 `UUID:v1` 및 소문자 SHA-256 64자리 문자열로 저장한다. 비공개 예약출판 Draft #6638과 서점·몰 판매보호 Draft #6718은 `UUID-v1`(안전한 URL 및 레코드 식별자)과 `sha256:<64자리>` 정본을 요구한다. 두 규격을 사용자가 임의로 변경하거나 JSON에서 승인 플래그를 쓰는 것만으로 출시가 가능해서는 안 된다.

새 `publishing/human/verified-workflow-bridge.js`의 `createVerifiedPublishingWorkflowBridge`는 **미리 배포된 인증·서명 검증 서버 바인딩**을 필요로 하는 fail-closed 연결 구현이다.

| 계약 | 소비/검증 |
|---|---|
| `workflow.getApprovedEdition({sourceEditionId})` | 자체 보안 DB에서 승인된 정확한 원고·QA 스냅샷 조회 |
| `workflow.verifyApprovedEdition({projectId,sourceEditionId,releaseDigest,revision,candidateSha256})` | **서버 보관의 서명/계약/자격/오디오 증거를 독립적으로 재검증**하고 고정 스냅샷 SHA-256과 같은 정본만 인증. 클라이언트 에코·단순 true 금지 |
| `privateAssets.verifyImmutableEdition({editionId,releaseDigest,publicationId})` | 서버 보관 비공개 EPUB 정본 존재/해시 확인, 변경·삭제 시 실패. 정본 조회 및 예약 시 재검증 |
| `channelReceipts.verifySignedAck(input)` | 독립 서점·몰 서비스의 서명된 준비/활성화 ACK 검증. 정확한 채널/판본/인계 키/단계를 모두 비교 |

위 RPC를 실제로 구현하거나 연결한 것은 **아니다**. 이 PR은 정본 형식 적응 계층과 검증 경계/회귀 테스트만 제공한다. 세 독립 RPC 바인딩을 운영에 구성하기 전에는 모든 함수가 실패(판매 금지)한다.

### 강제 게이트

- 워크플로 `publisher_approved` 또는 `scheduled/handoff_ready` 상태 + 저자 본인 `actor=approvedBy=authorUserId` + 발행자 `approvedBy` + 서명 검증 RPC 결과가 정확히 일치해야 한다.
- 재검증 시 판본 UUID, 승인 revision, 원본 64hex, 스냅샷 SHA256, 저자 서명, 발행자 서명, 자산·권리, 유료회원/계약 및 오디오 증명이 모두 참이어야 한다.
- 이전 양식의 판본/오디오/판매 계약 해시는 반드시 일치할 때만 예약출판 양식으로 변환된다. 잘못된 해시는 보정하거나 무시하지 않고 차단한다.
- 결과 도서의 편집·판매권리·고급 무료 오디오 정책을 `evaluateReleaseReadiness`로 재검증한다.
- 편집 스냅샷이 바뀌거나 권리가 취소되면 재등록/예약 인계 시 **재검증**하고, 전자서명·실파일·ACK 증거 없이 판매될 수 없다.
- `loadCandidate`는 비공개 준비용 후보만 제공한다. `verifyCompletedFile`, `verifyApprovalEvidence`, `verifyChannelAck`는 각각 서버 바인딩에 의존하며 새로운 출판자 권한을 생성하지 않는다.

### 테스트/운영 제한

```sh
node --test test/publishing-verified-workflow-bridge.test.mjs
node --check publishing/human/verified-workflow-bridge.js
```

단위 테스트는 오프라인 합성 RPC를 사용한다. 가짜 서명 검사기의 `true`가 운영 실증을 의미하지 않는다. 본 모듈의 GitHub 병합/테스트 통과도 기존 Draft #6638, #6679, #6718의 실제 병합·배포/연동이나 신규 도서 출간을 뜻하지 않는다.

**미완료:** 신뢰할 수 있는 원본 서비스·자산·영수증 RPC 구현/프로비저닝, 실제 D1/R2/cron, 두 Draft의 중복 판매가드 수렴, 저자/출판사 전자서명 Human Gate, EPUBCheck/Ace와 같은 판본의 고품질 MP3 전 트랙 듣기·상업 음성권리 검수, 서점/몰 구매·무료 오디오 권한·환불 회수·인세정산 E2E. 기존 두 도서 카탈로그, ISBN, 가격, 운영 DB, 결제 키·MID는 변경하지 않는다.
