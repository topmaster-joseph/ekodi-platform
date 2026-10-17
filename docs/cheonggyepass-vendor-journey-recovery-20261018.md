# EKODI 청계패스 공급업체 통합 접수 회귀 실증 — 공식 복구 기록

## 불변 승인·출처

- 원본 PR: [#5203](https://github.com/topmaster-joseph/ekodi-platform/pull/5203)
- 정확한 소유자 승인 커밋: `bb3c735654df897f815d23671e2739ac9fefe87d`
- 소유자 정확한 승인 마커: [GitHub 댓글](https://github.com/topmaster-joseph/ekodi-platform/pull/5203#issuecomment-6237907755)
- 승인 댓글 이후 `orchestrator-human-gate-approved` 라벨 적용.
- 공식 오케스트레이터 발급 작업: `orch_recovery_bb3c735654df897f815d23671e2739ac`
- 공식 보호 복구 PR: [#5214](https://github.com/topmaster-joseph/ekodi-platform/pull/5214)
- 최신 보호된 `main` (`d807294dce67f3680352aab97d27e6e92b49c7ee`)을 GitHub가 계산한 충돌 없는 병합 트리로 결합: `bbafa2b5e4650741c1086ee26a966266dcef9b6e`. 원본 승인 커밋은 부모로 보존.

## 코드 범위

이 PR은 소스 배포, 인증, R2/D1 설정이나 계좌·쿠폰 결제 로직을 변경하지 않는 **테스트 코드** 작업이다.

테스트 대상: 미인증 401, 업체별 조회 격리, GitHub PR 정확한 SHA 접수, 반복 제출 중복 방지, 외부 HTTPS API 명세 검증, ZIP 격리 저장 및 SHA-256, 스캔 이전 테스트 승격 차단, 관리자 반려 및 감사 원장. `node --test test/cheonggyepass-vendor-journey.test.mjs`의 검증은 **모의 인증 + Node SQLite + 모의 R2**이며 실제 Google 로그인이나 진짜 Cloudflare 저장소를 사용한 종단간 실증이 아니다.

## 미완료 실서비스 증거

실제 Google 인증이 적용된 관리자 계정과 외부업체 계정으로 각각 PC·모바일 Chromium에서 접수 화면을 열어야 한다. 비식별 GitHub PR/API 데이터 접수, 무해 ZIP 업로드, 접수자 본인 범위 및 최고관리자 검토를 실제 운영 R2/D1 기록으로 검증해야 한다. 실계정 비밀키·정산정보를 테스트에 사용하거나 외부 서비스에 유출하지 말 것.

공식 GitHub Actions 검증과 최신 main 충돌 확인, Human Gate, 보호 병합, 자동 롤백을 우회하지 말 것. 테스트 PR을 실제 시스템의 실증 완료로 기록하지 말 것. 이 문서는 공식 복구 브랜치의 CI 재실행을 위한 **문서 전용** 변경으로 실행 코드/데이터는 바꾸지 않는다.
