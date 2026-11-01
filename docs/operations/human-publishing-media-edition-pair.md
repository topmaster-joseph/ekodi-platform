# EKODI MEDIA-EDITION-PAIR-001 — EPUB·무료 오디오북 동일 판본 기술 검증

**Owner:** EKODI Orchestrator · central issue #6331 · task `chatgpt-6331-edition-media-pair-20261029-2306`.

## 목적

기존에 별도로 병합된 세 가지 오프라인 검수 기능을 한 단계로 연계한다.

1. `verify-audiobook-master.mjs`로 실제 MP3 파일의 헤더·실제 바이트 SHA-256·중복·장별 순서·경로 안전성 검사.
2. 서명된 별도 승인 흐름에서 받은 **정확한 고정 판본 해시 참조**와 챕터별 SHA-256 참조를 비교한다.
3. 일치한 경우에만 `verify-epub-formal-qa.mjs`를 통해 실제 EPUBCheck 및 DAISY Ace 명령을 오프라인 실행한다.
4. 결과가 모두 통과하면 판본 ID·EPUB 해시·챕터 해시를 결합한 결정론적 `bundleSha256`을 산출한다. 이 값은 **기술검수 지문**이지 출판승인/전자서명/권리증빙이 아니다.

## 실행

승인된 비공개 원본과 해시 참조가 있는 **인증된 작업용 PC/격리 스테이징**에서 실행한다. 검수기는 이미 설치되어 있어야 한다. 이 모듈은 검수기를 내려받거나 클라우드 API를 호출하지 않는다.

```bash
node scripts/verify-publishing-media-pair.mjs \
  --catalog books/books.json \
  --approved /private/approved-media-pins.json \
  --epub /private/immutable.epub \
  --audio-submission /private/audio-chapters.json \
  --audio-root /private/audio \
  --out /private/media-pair-report.json
node --test test/publishing-media-pair.test.mjs
```

`approved-media-pins.json` 예시(예시 해시는 실제 승인·정본이 아니며 교체 필요):

```json
{
  "bookId": "BOOK-EKODI-000001",
  "edition": "Digital First Edition · v1.7",
  "epubSha256": "<private immutable EPUB master SHA-256>",
  "audioChapters": [
    {"number":1,"title":"첫 장","sha256":"<private chapter 1 SHA-256>"}
  ]
}
```

`audio-chapters.json` 예시:

```json
{
  "bookId":"BOOK-EKODI-000001",
  "edition":"Digital First Edition · v1.7",
  "chapters":[{"number":1,"title":"첫 장","file":"chapter-001.mp3"}]
}
```

이 입력은 실제 에코디 출판자 승인 서비스가 발급해야 하며, 사용자 작성 JSON만으로 서명·권리·판매 자격을 증명하지 않는다. 구 카탈로그에서 판본 미확정 도서는 즉시 차단한다. 외부 서비스에 오디오·원고를 업로드하지 않고 경로를 보고서에 넣지 않는다.

## 판정과 판매 권한

- `blocked`: 정본·판본/해시·오디오 파일·EPUBCheck/Ace 중 하나라도 실패 또는 누락. 후속 검수 불가.
- `passed_automated_only`: 두 실파일 기술 검수 및 동일 판본 해시·챕터 순서가 모두 일치함. 사람 승인과 계약은 **여전히 별개**.
- `releaseReady:false`, `saleReady:false`: 모든 상태에서 변하지 않는다. 이 보고서는 서점/에코디몰에서 자동판매를 활성화하는 자격증명이 될 수 없다.
- 기존 2종 콘텐츠, 구매가격, 주문·환불·인세, R2/D1 운영 DB, 로그인, 결제 MID, 공개 URL, 판매상태 등은 전혀 변경하지 않는다.

**실제 미완료 게이트:** 승인된 신규 출판물의 EPUB 및 고급 오디오 전 트랙, 상업 음성·저자·발행자·제3자 저작권·접근성·전체 청취의 사람 검수; 별도 서명·감사 가능한 출판/저작권·인세/수수료 계약; 영구 식별자·ISBN·법적 검토; 보호된 #6679 편집 워크플로, #6638 예약 출판, #6718 서점/몰 판매 차단 통합 및 최초 구매/환불 실증. 검수 CLI 병합은 제품 출시 완료가 아니다.

단위 테스트에서 EPUBCheck/Ace 결과를 주입하는 부분은 실제 외부 검사기의 실행 증거가 아니다. 운영상 진짜 입력은 검수 기기가 별도로 보유한 정본이어야 한다.
