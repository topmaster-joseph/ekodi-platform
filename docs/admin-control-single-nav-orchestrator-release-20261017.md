# EKODI Control 관리자 메뉴 단일화 · 공식 복구 CI 검증 (2026-10-17)

이 문서는 사용자 승인된 기능 코드를 수정하지 않는 검증 체크포인트입니다.

- Human Gate 원본 PR: #5170
- 승인 대상 SHA: `1c6dadc040db84ec4eb25105a0c31743e3e6426f`
- GitHub 소유자 승인 댓글: https://github.com/topmaster-joseph/ekodi-platform/pull/5170#issuecomment-6233532458
- 공식 복구 워크플로: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39030184434
- 공식 복구 PR: #5178
- 병렬 변경 검토: https://github.com/topmaster-joseph/ekodi-platform/pull/5178#issuecomment-6233551687
- 관련 초안 PR #5174: 중복된 `control.css`, `scripts/verify-admin-production-ui-e2e.mjs`는 #5178 우선 통합 후 별도 검토. #5174의 독립 `/admin/control` 주소 제안은 보존하고 나중에 다시 검사.

## 운영 승인 조건

첫 번째 최고관리자 사이드바를 유지하고 iframe 내부에서 중복 세로 메뉴를 숨겨 가로 작업 탭을 표시합니다. 기존 대화·작업 이력, 독립 `/control` 화면, Google 인증과 관리자 권한은 보존합니다.

본 문서 작성은 승인이나 운영 성공을 의미하지 않습니다. CI, 오케스트레이터 출처 영수증, Human Gate 출처, 최신 main 충돌 검사, 보호 병합, 스테이징, 자동 롤백, PC·모바일 로그인·화면·명령/작업 이력까지 실제 운영 증거로만 완료 판정합니다.
