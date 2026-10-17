# 청계패스 EKODI 자체 Chromium 검증 — 공식 복구 내역 (2026-10-18)

본 문서는 공식 오케스트레이터 브랜치에서 **정식 GitHub CI를 실행하기 위한 문서 전용 변경**이다. 실행 코드, Worker, 프로덕션 인증, 데이터, R2/D1, 결제, 배포 정책을 변경하지 않는다.

## 승인과 보호 이력

- 원본 PR: [#5228](https://github.com/topmaster-joseph/ekodi-platform/pull/5228)
- 소유자 승인 정확한 SHA: `d36737c00c56b9c018177da1b943f86bd39bf06f`
- 승인 마커 댓글: https://github.com/topmaster-joseph/ekodi-platform/pull/5228#issuecomment-6243163756
- 승인 댓글 검증 후 적용한 라벨: `orchestrator-human-gate-approved`
- 정식 EKODI 오케스트레이터 복구 작업: `orch_recovery_d36737c00c56b9c018177da1b943f86b`
- 공식 복구 브랜치: `ai/gpt6/orch_recovery_d36737c00c56b9c018177da1b943f86b`, [복구 PR #5235](https://github.com/topmaster-joseph/ekodi-platform/pull/5235)
- 승인 소스를 부모로 보존하면서 보호된 `main` `bad0e6b92669ecfa67e032b5541ad1992bce3ce7`와 GitHub 검증 합병: `b2479c1e1a7f35dbfeb168b8ad5458c01f6d349d`

## 기능 및 테스트 판정 경계

- 읽기 전용 경로 등록부: `config/cheonggyepass-browser-surface-registry.json`; EKODI 기존 Background Browser Worker 사용.
- 모의인증 PC·모바일 UI 검증기: `scripts/verify-cheonggyepass-native-ui.mjs`; 운영 페이지 HTML/CSS/JS 로드하지만 테스트 신원·접수 API는 격리 브라우저 내부에서 모의.
- 테스트 계약: `test/cheonggyepass-native-browser-contract.test.mjs`; 문법·권한·운영서버 쓰기 금지 규칙 검사.
- 기존 소스 PR의 CI는 정적 계약·회귀 검사를 통과했지만, **Playwright 런타임 스크립트 자체의 성공은 아직 확인하지 않았음**.
- 실제 Google 로그인, 외부업체 역할, 운영 PR/ZIP/API 저장, 비공개 R2/D1 증거, 관리자 검토와 PC·모바일 실계정 검증도 **미완료**.

필수 CI 및 EKODI AI 오케스트레이터, 최신 main 충돌 검사, protected merge 이외 우회 수단 사용 금지. `action_required` 및 미실행 테스트를 성공으로 간주하지 말 것. 계정 프로필·OAuth 비밀을 CI에 저장하지 말 것.
