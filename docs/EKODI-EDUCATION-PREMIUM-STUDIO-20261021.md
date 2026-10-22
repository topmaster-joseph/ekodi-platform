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

## v2 (2026-10-22) — on-site practice and premium chrome
- **Header**: one owned sticky top bar (`.lv-top[data-ekodi-fixed-header]`) on every surface, never inside `<main>` (the EKODI Shell adopts it instead of a content block). Its measured height (`--lv-top-h`) offsets every other sticky element; the bottom dock height (`--lv-dock-h`) pads the page. Mobile/tablet (≤1023px) collapse instructor controls behind a menu button; the practice timer appears as a header pill. Audience window uses `data-ekodi-user-header="immersive"` and hides all chrome.
- **Typography**: self-hosted Pretendard Variable (dynamic unicode-range subsets, OFL 1.1, `education/fonts/pretendard/`), tabular numerals for clocks.
- **Guided practice** (Learner Lab): 준비 → FactChat 열기 (desktop: opens FactChat in the right half of the screen) → 프롬프트 ① → 프롬프트 ② → 결과 점검 → 완료·적용, with a fixed step dock, progress bar, completion ticks and full state recovery. The 10-part reference stays available under 「전체 안내 보기」.
- **Result checker** (`engine/checker.js`, rule-based, local, not AI): pasted FactChat output vs source — invented dates/times/numbers, invented contacts/links, undecided→「확정」, missing [확인 필요], dropped source facts; plus personal-data warnings. 「예시 결과로 연습」 uses the fallback sample when FactChat is unavailable. Instructors can demo it in review modules.
- **Probe**: production verifier additionally asserts header ≤72px (mobile)/≤80px, pinned while scrolling, no content under the header, page end not under the dock, Pretendard active, audience view header-free, and the guided flow including checker findings and reload recovery.

## v3 (2026-10-22) — 강사 직함·학위 확정, 활동 갤러리
- 강사 확인(2026-10-22): 「목사」 직함 추가, 학위 「국립목포대학교 경영대학원 경영정보시스템 전공 박사」.
- 활동 갤러리 3건: 청계면상인회 사이트(cgma.or.kr)에 공식 등록된 영상(cgma_resources)의 대표 장면 — 2025 가을 골목축제, 2024 가을 골목축제, 2025.11.12 자율상권구역 지원사업 공청회. 썸네일은 YouTube 이미지 CDN(i.ytimg.com)에서 `referrerpolicy=no-referrer`로 지연 로드하며 원본 영상으로 연결.
- 저장소의 EKODI 이미지 중 AI 생성 이미지(협동조합)·포스터는 강사 활동 사진으로 쓰지 않음.
- 발견(확인필요): `books/assets/ekodian-cover.svg`, `space/open-table-meal-260925.jpg`의 커밋 내용에 `[... ELLIPSIZATION ...]` 문자열이 섞여 이미지가 손상된 상태. 원본 파일로 교체 필요.
- 운영 프로브: 입장 페이지에서 목사·박사 표기와 링크된 갤러리 3건을 확인. YouTube 썸네일 장애는 `externalMediaWarnings`로 기록(배포 차단 아님).

## v4 (2026-10-22) — 강사 비밀번호 잠금, 강의↔실습실 화면 전환, 분야별 동시 실습
- 강사 운영실·발표/청중 화면·강사 노트(`*.notes.js`)·`instructor.js`·`present.js`는 Education Worker에서 서버 측 비밀번호 확인 후에만 제공(`education-instructor-gate.js`). 수강생 실습실·입장 페이지·공용 엔진은 공개 유지.
  - 비밀번호 검증값: PBKDF2-SHA256 100,000회(Workers 상한), 무작위 약 79비트 비밀번호 → 공개 저장소의 `EDU_INSTRUCTOR_GATE` 변수로 보관 가능. 사람이 정한 짧은 비밀번호는 이 방식에 쓰지 않음.
  - 세션: `EDU_GATE_SIGNING_KEY`(Worker secret)로 서명한 HttpOnly·Secure·SameSite=Lax 쿠키, 12시간, 경로 `/edu/study/live`. 배포마다 키를 교체하고, 운영 프로브는 그 키로 자체 세션을 발급해 강사 화면을 검증(비밀번호 저장 없음). 배포 후 강사는 다시 로그인.
  - 설정 누락 시 잠금 유지(fail closed). 잘못된 비밀번호 401, 교차 사이트 POST 403, 로그아웃 `?gate=logout`.
- 발표 화면 무대 전환(청중 화면 동기화): 1 강의 · 2 실습실(같은 출처 Learner Lab iframe, `embed=1`) · 3 나란히. 실습실 문서만 `frame-ancestors 'self'`·`X-Frame-Options: SAMEORIGIN` 허용.
- FactChat은 iframe으로 넣지 않음(기관 로그인·제3자 쿠키·링크아웃 원칙). 「FactChat 화면」(G)이 공식 사이트를 별도 탭으로 열거나 앞으로 가져옴(about:blank → opener 차단 → 이동).
- 분야별 동시 실습: 실습마다 「같은 시간, 각자 내 업무로」 슬라이드(7개 분야 원문 제목) → QR → 실습실에서 분야 선택 후 시작. 강사 운영실 실습 화면에 7개 분야 원문 한눈에 보기.

## v4.1 (2026-10-22) — 강사가 정한 비밀번호, 회차별 강사 카드 통일
- 강사가 정한 비밀번호: GitHub Actions secret `EDU_INSTRUCTOR_PASSWORD`(10~128자) → 배포 시 PBKDF2 검증값으로 변환해 Worker secret `EDU_INSTRUCTOR_GATE_SECRET`에 저장(저장소·로그에 비밀번호 없음). 설정되면 생성 비밀번호는 더 이상 쓰이지 않음. 변경은 secret 수정 후 배포.
- 수강생 실습실 강사 카드: 1·2회차 모두 같은 간단 카드(사진 원형 72px, 이름·직함·한 줄 소개·사이트) + 「강사 소개 더 보기」에서 경력·저서·활동 영상. 사진이 세로로 늘어나던 문제(height 속성) 수정. 입장 페이지는 전체 카드 유지.

## v4.2 (2026-10-22) — 강사 화면 비밀번호 해제, 수강생 화면 간결화
- 강사 결정: 강사 운영실·발표 화면은 비밀번호 없이 진입(`EDU_INSTRUCTOR_GATE_MODE = "open"`). 잠금 코드는 유지 — `"locked"`로 바꿔 배포하면 즉시 다시 잠김. 값이 없거나 잘못되면 잠금(fail closed).
  - 주의: 열림 상태에서는 강사 노트(정답 해설)도 주소를 아는 누구나 열 수 있음.
- 수강생 실습실: 상단 부제는 「N회차 · 회차 제목」만, 분야 선택·훅·목표 카드의 보조 설명 제거, 강사 카드는 이름·직함·한 줄 소개만(사이트·경력은 「더 보기」), 실습 1단계는 결과물만, 개인정보 안내는 한 줄 요약 + 펼쳐 보기.
