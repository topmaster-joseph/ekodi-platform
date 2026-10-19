# ADR 제안: 검색엔진 등록 자동화 모듈 (SEARCH-REGISTER-001)

- 상태: **결정 (v3)** — EKODI AI 협의 3회 모두 approve-with-changes, 지적사항 반영
- 협의 기록: 이슈 #5336
  - 1차 run 39223938198: 단일 검토(not_required), approve-with-changes
  - 2차 run 39224751056: 단일 검토, approve-with-changes
  - 3차 run 39225243586: highUncertainty 재검증 경로, planner·operator 모두 approve-with-changes. sentinel은 provider_disabled_or_missing → 협의 상태 partial로 기록 (AI-CONSULT-001: record-isolate-continue)
- task_id: search-register-automation-20261019
- 작성: 2026-10-19, Claude (교체 가능한 개발 작업자)
- 최초 대상: seonammedi.kr, 서남권국립의대.kr (xn--3e0b8b58jw4co4mnpll3k.kr)
- 확장 대상: EKODI가 Cloudflare로 DNS를 관리하는 모든 공개 도메인

## 1. 배경

2026-10-19 seonammedi.kr은 robots.txt·sitemap.xml·IndexNow 제출까지 자동화되었으나,
구글 Search Console·네이버 서치어드바이저의 "소유확인 + 사이트맵 제출"은 매번 사람이
로그인해 수작업으로 해야 한다. EKODI 생태계는 도메인이 계속 늘어나므로(교회, 상인회,
출판, 비즈) 사이트마다 반복되는 수작업을 없앤다.

## 2. EKODI 규칙 정합성

| 규칙 | 적용 |
|---|---|
| 실행 레인 순서 (AI-ORCHESTRATE-001 preferredLaneOrder) | 공식 API(2순위 github_actions 레인). 브라우저·원격 데스크톱 사용 안 함 |
| 비침해 원격 실행 (NON-DISRUPTIVE-REMOTE-EXECUTION) | 사용자 브라우저·쿠키·프로필 재사용 없음, 로그인 자동화 없음 |
| 비밀값 | 저장소에 커밋 금지. GitHub Actions secret 또는 Worker secret에만 보관 |
| 강제 다중협의 범주 (AI-CONSULT-001) | secrets, dns, authentication 해당 → multi_consult 필요 |
| 공급자 종속 금지 | 엔진별 어댑터(google, naver, indexnow)로 분리, 교체 가능 |
| 사람 게이트 | 계정 동의·키 발급(소유자 전용 인증)만 사람. 그 외 자동 |

## 3. 선택지

| 구분 | 주요내용 | 강점 | 개선점 |
|---|---|---|---|
| A. 서비스 계정 + DNS TXT (권장) | GCP 서비스 계정이 Site Verification API로 DNS_TXT 토큰 발급 → Cloudflare에 TXT 등록 → 확인 → 소유자 이메일 추가 → Search Console API로 도메인 속성 추가·사이트맵 제출 | 사용자 OAuth 갱신 불필요, 도메인 단위 속성(http/https/하위도메인 통합), 완전 무인 반복 | 최초 1회 GCP 서비스 계정 키 발급 필요. 일반 계정(Workspace 위임 없음)의 서비스 계정 소유확인 동작은 실캐너리로 검증 필요(확인필요) |
| B. 소유자 OAuth 리프레시 토큰 | 소유자 구글 계정 동의 → 리프레시 토큰을 Worker secret(AES-GCM, ekodi-storage-control 패턴)으로 보관 | 소유자 본인 계정으로 바로 속성 생성 | 토큰 만료·철회 시 재동의, 범위 확대(권한 상승) 관리 부담 |
| C. 메타 태그 슬롯 (수동 보조) | search-engine-verification.js 레지스트리에 코드 한 줄 추가 | 즉시 사용 가능, 모든 엔진 공통 | 엔진 화면에서 사람이 "확인" 클릭 필요 |

결정 제안: 구글은 A, A 캐너리 실패 시 B로 폴백.
네이버: 1차 협의 결과 서비스 계정형(M2M) 공개 등록 API 없음 → **자동화하지 않음**.
세션 쿠키 주입·스크래핑은 NON-DISRUPTIVE-REMOTE-EXECUTION 위반이므로 금지.
네이버는 C(메타 태그 슬롯, 사람 1회 클릭) + 기존 IndexNow 자동제출로 처리.

## 4. 설계 (A)

워크플로 `register-search-engines.yml` (workflow_dispatch, 입력: domain, sitemap_path)

1. 입력 검증: domain이 허용 목록(Cloudflare 활성 존 + EKODI 레지스트리)에 있어야 함
2. 서비스 계정 액세스 토큰 발급 (scope: siteverification, webmasters)
3. `webResource.getToken` (site.type=INET_DOMAIN, verificationMethod=DNS_TXT)
4. Cloudflare DNS: 같은 값 TXT가 없을 때만 추가(멱등), comment "Managed by EKODI SEARCH-REGISTER-001"
5. `webResource.insert` — DNS 전파 대기 지수 백오프(최대 10분)
6. 소유자 추가: `webResource.update`로 owners에 소유자 이메일 포함
7. Search Console `sites.add` (siteUrl `sc-domain:<domain>`, 형식 확인필요) → `sitemaps.submit`
8. 결과 증거(JSON: 각 단계 HTTP 코드, TXT 레코드 ID, 확인 상태)를 실행 요약에 기록. 토큰·키 값은 출력 금지

## 5. 보안·권한 (1차 협의 반영)

- 비밀값은 저장소 단위가 아니라 GitHub **Environment `search-registration`** 단위로 격리
  - `GOOGLE_SEARCH_SA_KEY_JSON`: 서비스 계정 키
  - `CLOUDFLARE_DNS_TXT_TOKEN`: **전용 최소권한 토큰** (Zone:DNS:Edit, 허용 존만). 광범위한 기존 `CLOUDFLARE_API_TOKEN`은 사용하지 않음
  - 전용 토큰이 아직 없으면 워크플로는 DNS 단계 전에 `HUMAN_GATE_SCOPED_DNS_TOKEN_REQUIRED`로 정지(광범위 토큰으로 폴백하지 않음)
- 서비스 계정 권한은 Site Verification API·Search Console API만. GCP IAM 역할 부여 없음
- DNS 쓰기: TXT **추가만**(동일 값 존재 시 건너뜀). 기존 레코드 덮어쓰기·수정·삭제 없음. TTL 300
- TXT 정리(pruning): 구글은 확인 TXT가 남아 있어야 소유권이 유지되므로 삭제하지 않음. 폐기 시에만 별도 승인 작업
- 소유권 바인딩: 서비스 계정이 자기 이름으로 확인 → `webResource.update`로 소유자 이메일을 owners에 추가 → 소유자 Search Console에 속성이 나타남
- 키 회전 90일, 유출 시 GCP 키 폐기
- 허용 도메인 정본: Cloudflare 활성 존 목록 ∩ 워크플로 허용 목록(코드 리뷰를 거치는 변경)

## 5-1. 3차 협의 반영

- 한글 도메인은 모든 API·DNS 호출 전에 ACE(punycode)로 정규화 (`normalizeDomain`)
- TXT 수명주기: 생성 시 comment `Managed by EKODI SEARCH-REGISTER-001`. 속성이 유효한 동안 유지(구글 소유권 유지 조건), 도메인 폐기 시에만 별도 승인 작업으로 삭제
- 비밀값: 저장소가 개인 계정 소유라 Organization secret 불가 → Environment `search-registration` 격리 (EKODI Core Vault 도입 시 이관)
- 도메인 속성(`sc-domain:`)의 사이트맵은 전체 URL(`https://<domain>/sitemap.xml`)로 제출

## 6. 검증·롤백

- 단위 테스트: 입력 검증, 멱등 TXT upsert, 백오프, 비밀값 비노출
- 캐너리: seonammedi.kr 1개 도메인 → Search Console 속성·사이트맵 상태 API 재조회로 확인
- 롤백: TXT 레코드 삭제, Search Console 속성 삭제(사람 승인 필요한 비가역 아님)

## 7. 사람 게이트 (소유자 1회)

1. GCP 프로젝트에서 Site Verification API, Google Search Console API 사용 설정
2. 서비스 계정 생성 및 JSON 키 발급
3. GitHub 저장소 secret `GOOGLE_SEARCH_SA_KEY_JSON` 등록

## 8. EKODI AI 협의 질문

1. 서비스 계정 방식(A)이 EKODI 신원·비밀값 정책과 충돌하는가? B가 더 적합한가?
2. 비밀값을 GitHub Actions secret에 둘지, Worker secret + 관리자 화면 실행으로 둘지?
3. DNS TXT 자동 추가 권한 범위가 적절한가? 허용 도메인 목록의 정본 위치는?
4. 누락된 위험·검증 항목이 있는가?
