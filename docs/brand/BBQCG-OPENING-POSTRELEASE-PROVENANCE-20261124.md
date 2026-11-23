# BBQ 무안청계점 2026-11-24 개점 — postrelease 정본 검증

## 에코디 AI 승인 작업 경위
- Owner 요청: 11월 24일 BBQ 무안청계점 온라인 영업준비 실증 및 개선. 중앙 의도 #10303.
- 첫 공식 소스·PR: #10305 — 개점일·전화 CTA·CSS 수정, 보호 병합.
- 두 번째 공식 복구: #10311 — 41개 공개 변환 /mission/ 정본 canary mismatch 수정, 보호 병합.
- 공식 Space 운영 배포 run [45206555497](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/45206555497)은 guarded Worker rollout와 고객 BBQ 공개화면까지 반영했으나 scripts/verify-ekodimission-production.mjs 사후 검증이 raw /ekodimission/ 경로를 기대해 failure. 사후 검사 무효화 금지.
- 실제 BBQ 공개 홈페이지/QR 페이지는 익명 GET로 11월 24일 개점, 매장 전화 우선, PG·자동 주문 미개통을 확인함. 배포 workflow completion은 여전히 pending.
- 해당 원인만 수정하는 원 소스 PR #10312 @414d8845906a81ba6795c12b62f9e9b0453d7aad. EKODI 공식 recovery task orch_recovery_414d8845906a81ba6795c12b62f9e9b0, 보호 PR #10313.
- 최초 recovery PR의 GitHub-bot 이벤트에서 실제 check jobs가 실행되지 않아 action_required만 생성되었으므로 owner-authored 문서 전용 CI 재요청 커밋. 실행코드·정책·auth·PG·deployment API·route·rollback or validation gate를 변경하지 않음.

## 명확한 완료 판정
공식 orchestration receipt+보호 CI/스테이징/병합 + 실제 Space guarded deployment success + Verify EKODI Mission production shell contract success + https://ekodi.kr/bbqcg 개점 문구·전화 CTA + /bbqcg/order PG OFF 유지 확인. 브라우저 임의 탭 금지, 인가 없는 데이터/결제 수정 금지, 타 점포 격리 유지.

## 미완료 기능
점주 승인 메뉴/판매가, 실제 독립 PG merchant 계약, 배달 플랫폼 가맹점 입점 URL, 모바일 QR 이미지 다운로드, 점주 매장 주문수신 ACK 및 알림 실기기 인증은 별도로 검증 필요. 미확인 항목 활성화 불허.
