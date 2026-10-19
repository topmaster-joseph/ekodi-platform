# ADR 제안: 에코디 플랫폼 전체 사용자 사이트 검색 노출 (SEARCH-EXPOSURE-ALL-001)

- 상태: **결정 (v2)** — EKODI AI 협의 approve-with-changes, 지적사항 반영
- 협의 기록: 이슈 #5353, run 39231255823 (planner approve-with-changes; operator·sentinel provider_disabled_or_missing → 부분 협의로 기록, AI-CONSULT-001 record-isolate-continue)
- task_id: all-sites-search-exposure-20261019
- 작성: 2026-10-19, Claude (교체 가능한 개발 작업자)
- 선행: SEARCH-REGISTER-001 (이슈 #5336, seonammedi.kr 단일 도메인)
- 소유자 요청: "에코디플랫폼 사용자 사이트 전체에 대한 노출도 가능하도록 에코디랑 협의해서 설정해"

## 1. 현황 (2026-10-19 운영 D1 `ekodi-auth` 읽기 전용 조회)

| 구분 | 주요내용 |
|---|---|
| 사이트 공개설정 `public_site_controls` | 48개 중 public 47, maintenance 1 (cgma — 소유자 설정, 유지) |
| 활성 고객 테넌트 `customer_tenants` | 19개 (교회·선교회·연구소·상인회·협동조합·매장·동문회 등). 대부분 `ekodi.kr/<slug>`, 일부 `cafe.ekodi.kr`, `yogurt.ekodi.kr` |
| robots.txt (ekodi.kr) | `*`·Googlebot·bingbot 허용, 관리/인증/API 차단, Sitemap 표기 |
| sitemap.xml (ekodi.kr) | `public-discovery-registry.js`가 공개 상태 사이트 전체 + 공개 콘텐츠를 동적 생성 |
| IndexNow | 배포 성공 시마다 공개 레지스트리 전체 URL을 네이버·Bing·IndexNow에 자동 제출 |
| 페이지 머리말(head) | canonical·robots·og·JSON-LD는 고정 10개 경로(`DISCOVERY_PUBLIC_ROUTES`)에만 적용. 나머지 사용자 사이트는 라우트별 개별 구현에 의존(일관성 없음) |
| Google Search Console | 등록 자동화(SEARCH-REGISTER-001) 허용 목록이 seonammedi 2개 도메인뿐. 실행은 소유자 비밀값 2개 미등록으로 사람 게이트에서 정지(run 39226083027) |
| 한국 검색엔진 | robots에 네이버(Yeti)·다음(Daum) 전용 그룹 없음(`*`로만 허용) |

## 2. 제안

| 구분 | 주요내용 | 강점 | 개선점 |
|---|---|---|---|
| A. 공용 검색 머리말 보정 | 라우터 최종 단계에서 "공개" 상태로 확인된 모든 사용자 사이트 HTML(200)에, 없을 때만 canonical(자기 URL, 쿼리 제거)·`robots index,follow`·description·og:url/og:site_name을 추가. 이미 있는 태그는 절대 덮어쓰지 않음 | 사이트가 늘어도 자동 적용, 개별 구현 보존 | 사이트별 설명문 품질은 관리자 입력이 필요(현재는 사이트명 기반 기본값) |
| B. 비공개 차단 보존 | private/maintenance 사이트·관리자·인증·API 경로·`noindex` 응답에는 아무것도 추가하지 않음 | 공개 설정이 정본(Source of Truth) | — |
| C. 한국 검색로봇 명시 | robots에 Yeti(네이버)·Daum 검색로봇을 검색색인 그룹으로 추가 | 국내 노출 명확화 | — |
| D. Search Console 허용 목록 확장 | SEARCH-REGISTER-001 허용 목록에 `ekodi.kr` 추가. 도메인 속성 `sc-domain:ekodi.kr` 하나로 모든 경로형 사이트와 `*.ekodi.kr` 하위 도메인이 포함됨 | 등록 1회로 전체 사용자 사이트 포괄 | 소유자 1회 비밀값 등록(서비스 계정 키, 범위 제한 DNS 토큰) 필요 — 사람 게이트 유지 |
| E. 실서비스 검증 자동화 | GitHub Actions에서 공개 레지스트리 전체 URL을 표본·전수 점검(HTTP 200, noindex 없음, canonical 존재) 후 결과를 실행 요약에 기록 | 회귀 즉시 감지 | 러너 송신 IP가 일부 사이트 보안정책에 막힐 수 있음(확인필요) |

## 3. 보안·권한

- 운영 데이터 쓰기 없음. D1 조회는 읽기 전용
- 새 비밀값 없음. Search Console 자동 등록은 기존 Environment `search-registration` 격리 비밀값만 사용, 광범위 토큰 폴백 금지 유지
- 머리말 보정은 문자열 삽입만 하며 값은 HTML 이스케이프, 사이트 이름·URL만 사용(사용자 입력 원문 미사용)
- 로그인 자동화·브라우저 세션 재사용 없음 (NON-DISRUPTIVE-REMOTE-EXECUTION 준수)

## 4. 검증·롤백

- 단위 테스트: 태그 미존재 시 추가, 기존 태그 보존, noindex·비HTML·비200·비공개 미적용, 이스케이프
- 회귀: 기존 discovery-layer·register-search-engines 테스트 전체 통과
- 롤백: 라우터의 보정 호출 1줄 제거(또는 PR 되돌리기). 데이터 변경 없음

## 5. EKODI AI 협의 질문

1. 공개 상태 사이트에 기본 `index, follow`를 보정하는 것이 사이트 공개 정책(EKODI-SITE-PUBLICATION-001)과 충돌하는가?
2. canonical을 "자기 URL"로 둘지, 사이트 대표 URL로 모을지? (본 제안: 자기 URL, 쿼리 제거)
3. `sc-domain:ekodi.kr` 단일 속성 등록이 테넌트 분리 원칙과 충돌하는가? 테넌트별 URL 접두어 속성이 필요한가?
4. 누락된 위험(중복 콘텐츠, 개인 작업공간 노출 등)이 있는가?

## 6. EKODI AI 협의 반영 (v2)

| 구분 | 지적사항 | 반영 |
|---|---|---|
| 공개 동의 | public 상태만으로 검색 노출을 가정하지 말고 명시적 동의 확인 | 플랫폼 소유자가 2026-10-19 전체 공개 사이트 검색 노출을 명시 승인(본 요청). 테넌트별 거부는 `SEARCH_EXPOSURE_OPT_OUT_SITES`(코드 리뷰 변경)로 즉시 `noindex` 처리 — 사이트 접근은 유지 |
| 인증 방식 | 경로형 테넌트는 루트 도메인으로 일괄 커버, 서브도메인·커스텀 도메인은 메타태그 또는 중앙 DNS API 위임, 파일 업로드 방식 배제 | `sc-domain:ekodi.kr` 도메인 속성(DNS TXT, 중앙 Cloudflare)으로 경로형·`*.ekodi.kr` 모두 포괄. 파일 업로드 인증 미사용 |
| IndexNow 키 | 키 격리 요구 | IndexNow 프로토콜상 키는 `/<key>.txt`로 공개되는 값(비밀 아님). 테넌트별 키 미발급 유지. 변경 없음 |
| 제출 빈도 | 배포마다 전체 제출 → 변경분(diff) 큐 권고 | 기존 동작 유지(현재 URL 수 < 1,000, 한도 10,000). diff 큐는 후속 과제로 등록(확인필요: 실제 rate limit 응답 여부) |
| 단계 적용 | Canary 후 확대 | 머리말 보정은 "없을 때만 추가"라 기존 화면 변경 없음. 배포 후 표본 사이트 실측 → 문제 시 라우터 1줄 롤백 |
