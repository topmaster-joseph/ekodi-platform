# 에코디서점 직접판매 준비도 (BOOKS-SALE-READINESS-001)

## 문제
`books/books.json`의 `directSale.enabled: true`만으로 서점 목록에 "에코디서점에서 구매하기"가 노출되었고,
서버도 판매 파일과 결제만 준비되면 주문을 받았다. 『AI 시대의 진보와 빈곤』(BOOK-EKODI-000002)은 원고·편집·EPUB·판본이
모두 `needs_verification`인데도 구매 가능한 것처럼 보였다.

## 규칙 (서버가 결정, fail-closed)
`books-sale-readiness.js`의 `saleReadiness(book)`이 다음을 모두 만족할 때만 판매 준비 완료로 본다.

| 항목 | 조건 |
|---|---|
| 직접판매 의도 | `directSale.enabled === true` |
| 판매 파일 지정 | `directSale.fileKey` 존재 (실재 여부는 `fileReady` R2 확인) |
| 판본 | `edition` 확정 |
| 가격 | `listPrice.amount > 0` |
| 출판 공정 | manuscript·editing·cover = complete, epub = validated, metadata = ready, storefront = live |

적용 위치: `quote`(결제창 닫힘·실제 상태 문구), `createOrder`(운영자 포함 409 `BOOK_NOT_SALE_READY`),
`confirm`(토스 승인 호출 **전** 재확인 — 청구 없음). 이미 구매한 독자의 서재·다운로드 권한은 바꾸지 않는다.

## 다른 게이트와의 관계
- 결제 준비(운영키·MID), 판매 파일 실재: 기존 `ekodipay`·`fileReady` 게이트 유지
- 신규 판본의 권리·출판 승인: PR #6718 `storefront-release-guard` (이 규칙과 AND로 결합)
- 오디오북: `books-audiobook.js` — 권리·검수 미완료 시 제공하지 않음

## 판매 개시 절차 (BOOK-EKODI-000002)
출판 검수가 실제로 끝나면 카탈로그의 `edition`과 `workflow`를 증거에 맞게 갱신하는 PR을 올린다.
가격·판본·권리 확정은 Human Gate이며, 자동화가 이 값을 임의로 채우지 않는다.
