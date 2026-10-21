# EKODI Education Premium Studio · 국립목포대학교 FactChat 실무 캠프 (2026-10-21)

Task ID: edu-premium-studio-factchat-20261021 · Agent: claude · Branch: `ai/claude/edu-premium-studio-factchat-20261021`
Classification: reversible static extension of the existing Education Worker (`education/`). No new Worker, domain, DB, auth realm, secret or server endpoint.

## Surfaces (canonical `ekodi.kr/edu` alias; same paths without `/edu` on the Education origin)
| Surface | Path | Notes |
|---|---|---|
| Instructor Studio (강사 운영실) | `/edu/study/live/?c=mnu-factchat-2026` | 좌측 과정·진행표, 중앙 강의/실습, 우측 타이머·QR·발표 제어, 하단 주요 작업 |
| Live Presentation (발표자) | `/edu/study/live/present/?c=mnu-factchat-2026` | 발표자 노트, 다음 슬라이드, 실습 타이머, B/F/N/←/→/PageUp/PageDown, 인쇄·PDF |
| Audience window (청중) | `/edu/study/live/present/?c=mnu-factchat-2026&view=audience` | 노트를 불러오지 않음, 두 번째 모니터용 |
| Learner Lab (수강생) | `/edu/study/live/lab/?c=mnu-factchat-2026&s=1&m=hwp` | QR 딥링크, 직무 7종·난이도 3단계, 복사 프롬프트, 체크리스트, 로컬 기록 |
| Short learner entry | `/edu/factchat/` | 회차별 입장 버튼 |

The existing 4회차 × 6세트 classroom (`/edu/study/ai-bootcamp/`, `catalog.js`) is unchanged and listed as a separate course.

## Architecture
- `engine/model.js` — Course → Session → Module → Activity → Practice(mission) → Assessment(criteria/rubric) → Artifact(deliverable). New courses add a data file only.
- `engine/live-state.js` — pure reducer; instructor/presenter/audience windows on one computer sync via BroadcastChannel + localStorage. Timers are absolute timestamps → refresh/crash safe. Manual 「수동 동기화」 fallback.
- Cross-device sync without a server: the QR/link carries `c,s,m,lv,e` (practice end epoch) so learner devices show the same countdown. No personal data.
- `engine/qr.js` — same-origin QR encoder (byte mode, ECC M, v1–20); decode-verified with jsQR across 105 samples (v1–19).
- `courses/*.notes.js` — instructor notes; loaded only by studio/presenter. Public static asset: pedagogy and fictional answer keys only (server-private notes = P1).
- `tools/factchat.js` — link-out only (`https://mokpo.factchat.bot/dashboard/chat/40882`). Facts from Mindlogic official docs with each page's last-updated date. Every feature starts as `기관 계정 실증 대기 · 확인필요`; the instructor may mark it locally after checking on the institutional account.

## Course check
1회차 0–10 강의 / 10–25 기초 / 25–40 시연 / **40–70 실습① HWP** / 70–80 휴식 / **80–110 실습② 회의록** / 110–120 검증·공유.
2회차 0–15 조사·출처 / 15–25 PPT 시연 / **25–55 실습③ 발표자료** / 55–65 휴식 / **65–95 실습④ 자유 프로젝트** / 95–110 검증·우수사례 / 110–120 부서 간 활용·적용계획.
Total 240 min; individual practice 4 × 30 = 120 min (enforced by `validateCourse` and tests).

## Not implemented / needs verification (honest status)
- FactChat API/SSO: not implemented (no official contract confirmed). Issue #5533 not depended on.
- FactChat feature availability, menu location, credits on the MNU account: 확인필요 (official docs only).
- Server-side instructor auth/role separation, consent-based submission, results aggregation, versioned server storage: P1, not implemented. Participation counts are intentionally not displayed.
- AI auto-generation of lesson plans: not provided (rule-based templates only).
- Attendance, official assessment, certificates: disabled.

## Verification
- `node --test test/education-live-studio.test.mjs` (12) + existing education suites (41) + `npm run check`.
- `scripts/verify-education-live-studio-native.mjs` — EKODI-owned Chromium E2E at 320/390/768/1366/1440: instructor (course/session → dashboard 240/120 → mission 10 sections + notes → presenter sync → practice timer + QR link → keyboard sync → blackout → audience has no notes → refresh restores timer → Markdown export), learner (QR deep link + synced countdown → PC-only notice on mobile → track switch → FactChat link → prompt copy → material download → reload recovery → OX quiz → record export), overflow, existing bootcamp regression, console/HTTP/request errors, learner never requests notes. Added to the Education production lane after deploy.

## Rollback
Revert the PR (static assets + tests + workflow lines). No data migration.
