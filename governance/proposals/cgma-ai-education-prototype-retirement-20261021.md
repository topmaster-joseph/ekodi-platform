# ADR 제안: 청계면상인회 AI 교육 수요조사 구버전 시제품 퇴역 (CGMA-AIEDU-RETIRE-001)

- 상태: **결정 (v2)** — EKODI AI 협의 2회, 2차 sentinel approve-with-changes 반영
- 협의 기록: 이슈 #5524
  - 1차 run 39535552797: partial. sentinel reject — 사유는 협의 도구 결함(본문 1,200자 절단, 요약 하드코딩). 도구 수정 #5527/#5528
  - 2차 run 39535775334: partial(전문가 2, sentinel 1). sentinel **approve-with-changes**: 503 유지 지지(308은 루프·영구캐시 위험), 경로만 로깅 유지, 우회 이상징후 집계·알림 추가 요구
- 릴리스: #5525 → orch_recovery #5526 병합(fdd3cf2). 2차 협의 결과 수신 전 자동 병합됨 — 요구사항은 후속 PR로 반영
- task_id: cgma-ai-education-prototype-retire-20261021
- 브랜치: `ai/claude/cgma-ai-education-prototype-retire-20261021`
- 작성: 2026-10-21, Claude (교체 가능한 개발 작업자), 대표 지시 "에코디랑 협의해서 정리해 그리고 구축해"

## 1. 배경 (실측, 2026-10-21 KST)

| 항목 | 사실 |
|---|---|
| 실서비스 경로 소유자 | `ekodi.kr/cgma*` → Worker `cgma-root-gateway` (cheonggye-market 저장소) |
| 운영 설문 원본 | cheonggye-market `ai-education/` v3 + `functions/api/ai-education-*.js`, D1 `cheonggye-market-notices` |
| 운영 데이터 | 유효 응답 8건(전부 v3), 안내 연락처 6건, 활성 공유 0 (D1 읽기 전용 조회) |
| Shared Site 구버전 | `prototypes/cgma-ai-education-survey.*` (2026-10-16): 응답 서버 저장 없음, `connect-src 'none'` |
| 영향 | 게이트웨이에 가려 현재 트래픽 0. 그러나 게이트웨이 라우트가 빠지면 **저장되지 않는 설문**이 조용히 노출되어 응답 유실 |
| 실제 혼선 | 2026-10-21 접수현황 문의 시 구버전 코드만 보고 "저장 기능 없음"으로 오답 발생 |

## 2. 결정 제안

1. Shared Site의 구버전 시제품 HTML/JS와 빌드 복사, `_headers` 블록, 구 테스트를 삭제한다.
2. `cgma-ai-education-route.js`는 삭제하지 않고 **fail-closed 가드**로 전환한다: 설문 경로 요청이 Shared Site에 도달하면
   설문을 제공하지 않고 503(no-store, `x-ekodi-route: cgma-ai-education-retired-prototype`, `x-ekodi-source-of-truth`)과
   "응답이 저장되지 않는 화면은 제공하지 않습니다" 안내를 반환하고, 경로만 오류 로그로 남긴다(본문·쿼리 미기록).
3. 회귀 가드: 시제품 파일 부재, 빌드 산출물에 설문 자산 없음, 운영 엣지 검증이 cheonggye-market v3 마커와
   `cgma-ai-education-api` 헤더를 계속 고정하는지 단위 테스트로 강제한다.

## 3. EKODI 규칙 정합성

| 규칙 | 적용 |
|---|---|
| 단일 원본 (Source of Truth) | 설문·데이터·관리자 통계는 cheonggye-market 한 곳 |
| 운영 데이터 보존 | D1 무변경. 운영 응답·연락처·공유 테이블 접근 없음 |
| fail-closed | 게이트웨이 우회 시 저장 안 되는 폼 대신 503 |
| 릴리스 경로 | 태스크 브랜치 PR → orch_recovery → 수렴 병합 → Site Core 가드 배포 (자체 병합 금지) |
| 롤백 | 이 PR 되돌리기로 즉시 복구 가능. 운영 트래픽 경로(게이트웨이) 미변경 |

## 4. 검증

- `npm test`: 5,230 통과 / 실패 0
- `validate:constitution`, `validate:boundaries`, `validate:deployments`, `validate:architecture` 통과
- `node scripts/build.mjs`: 성공, `dist/cgma/`에 `ai-education` 없음

## 5. 협의 요청 사항

- 퇴역 방식(삭제 + fail-closed 가드)이 EKODI 정책에 맞는가
- 503 대신 운영 원본으로 308 리다이렉트가 더 적절한가 (현재 판단: 게이트웨이 장애 시 루프 위험으로 503 유지)
- 추가로 필요한 가드레일

## 6. 협의 반영 (v2)

| sentinel 요구 | 반영 |
|---|---|
| 503 유지, 308 금지 | 유지 |
| 본문·쿼리 미기록, pathname만 | 유지 (`[ekodi-anomaly] cgma-gateway-bypass <pathname>`) |
| 우회 이상징후 메트릭·알림 | 가드 응답에 `x-ekodi-anomaly: cgma-gateway-bypass` 헤더, 매시간 독립 감시 `cgma-ai-education-health-watch.yml` + `scripts/monitor-cgma-ai-education.mjs`가 운영 설문 소유자·관리자 전용 통계 경계를 확인하고 이상 시 장애 이슈 1건 생성(우회는 gateway_bypass로 명시), 회복 시 자동 종료 |
