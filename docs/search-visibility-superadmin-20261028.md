# SEARCH-VISIBILITY-001 · 최고관리자 검색노출관리

## 사용자 진입
- `https://ekodi.kr/admin/settings/search-visibility` (설정·연동 > 검색노출관리)
- 플랫폼 최고관리자 Google 로그인 후 표시. API `/api/session`에서 `super_admin` 권한 확인.
- 중앙 공개 사이트 원장 `/public-registry.json`의 `type=site`만 표시하고 서남권 국립의대 소통센터를 기본 검사 대상으로 제시한다.
- 비공개 사이트, `/admin`, `/auth`, `/api`, `/my` 등은 대상에서 제외.

## 운영 순서
1. 공개 사이트와 대표 URL 확정 (대표 도메인 `https://seonammedi.kr`, 시민 홍보주소 `https://서남권국립의대.kr`)
2. 중앙 경로의 HTTP·canonical·robots·description·title·H1을 기술 진단
3. 구글 Search Console, 네이버 Search Advisor, 다음 Webmaster, 빙 Webmaster 공식 화면에서 소유권 확인
4. `https://seonammedi.kr/sitemap.xml`을 제공자별로 제출
5. 제공자 URL 검사/수집 현황에서 색인 확인
6. 권한이 확인된 원본 측정치가 연결되기 전까지 검색 실적은 `미연동`

## 증거 수준 및 한계
- 기술 진단은 같은 출처 `https://ekodi.kr/seonammedi/`의 HTML 확인. 독립 호스트의 Cloudflare DNS나 검색엔진 소유권 인증을 증명하지 않는다.
- 체크박스는 **해당 브라우저에 저장한 운영자 수동 기록**이다. provider API 동기화, 중앙 DB 또는 교차기기 상태 동기화가 아니다. 내보내기(JSON) 가능.
- 검색엔진별 `미확인`을 `등록 완료` 또는 `색인 완료`로 오인하지 않는다.
- 정본 작업·감사 기록은 이슈 #6317을 사용한다. 도메인 전환, TXT 소유권 인증, 검색엔진 권한 부여는 기존 보호된 에코디 오케스트레이터 절차를 따른다.
- 신규 기능은 GitHub PR 승인, 필수 CI, 보호 병합, 스테이징 및 운영 확인 전까지 **개발 브랜치에만 존재**한다.

## 확인 기준
- 공개 원장 정상 열람, 모바일/PC에서 사이트 선택 및 기술 진단
- `super_admin` 외 접근 시 데이터 표시 차단
- 한글 별칭 도메인과 영문 canonical을 혼동하지 않음
- 미연동 상태 및 수동 기록 표기를 명확히 분리
- 모든 기능 접근이 정식 `/admin/settings/search-visibility` 경로를 사용

## 다음 통합 단계
- 제공자별 검증된 서버 API 및 인증된 증거 저장소(DB) 연결
- 301 호스트 경로 검증, 개별 게시물 canonical, 공개 sitemap 확장
- Google Search Console 기본 속성/사이트맵 소유자 확인; GSC Wizard 구독 차단은 별도 서비스이고 본 기능에서는 사용하지 않음
