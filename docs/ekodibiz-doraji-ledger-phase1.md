# EKODIBIZ 도라지 계약재배: 업무원장 1단계

공식 주소: `https://ekodi.kr/ekodibiz/doraji`. 구형 Business OS 서브도메인은 사용하지 않는다.

## 이번 단계
- 기존 Cloudflare D1 `ekodi-auth`에 `schemas/ekodibiz/doraji-draft-ledger.sql`을 추가한다.
- 기존 에코디 관리자의 중앙 Bearer 세션으로만 `/ekodibiz/doraji/api/v1/*`에 접근한다. 인증 또는 D1이 없으면 거부한다.
- 관리자 소유 프로젝트 생성·조회·수정, 프로젝트별 재배·예산·수매계약·납품·문서 **초안** 기록 생성·조회·수정, 감사 이력 조회.
- 프로젝트 소유자와 명시적으로 할당된 열람자·편집자만 프로젝트 원장을 볼 수 있다. 다른 사업단위의 자료 조회는 404로 차단한다.
- 변경 버전 불일치 409, 쓰기 시 관리자 인증, 날짜·금액·수량 입력 제한, 비공개 응답 및 캐시 금지.
- 서명, 결제, 실제 대금 지급, 매입계약 승인, 검수 확정, 정산 승인 및 문서 업로드는 아직 미구현이며 실행 불가.
- 로그인·업무자료 입력 UI는 다음 단계. 현재 공개 업무화면은 아직 기획/시뮬레이션 화면이다.

## API: 인증된 관리자 전용
기본: `/ekodibiz/doraji/api/v1`. 브라우저 공개 토큰, 개인 쿠키 또는 임의 문자열로 접근권한을 부여하지 않는다.

- `GET /projects`: 접근권한 있는 프로젝트 목록
- `POST /projects`: `{"name":"도라지 계약재배 1차","region":"전남","greenhouseCount":2,"areaSqm":500}`
- `GET /projects/{uuid}`: 프로젝트 열람
- `PATCH /projects/{uuid}`: `{"version":1,"status":"planning"}` 등 초안 진행 관리
- `GET /projects/{uuid}/records?kind=cultivation|budget|contract|delivery|document`
- `POST /projects/{uuid}/records`: `{"kind":"cultivation","date":"2026-10-15","title":"관수일지","note":"관수상태 점검"}`
- `PATCH /projects/{uuid}/records/{recordUuid}`: `{"version":1,"note":"추가 현장확인"}`
- `GET /projects/{uuid}/audit`: 감사 이력

모든 기록은 `state: draft`로 유지한다. D1 프로젝트 멤버 할당은 이 API에서 지원하지 않으며, 추후 별도 승인·감사 흐름이 필요하다.

## 운영 전 필수 조건
1. 모든 코드·테스트·스테이징 및 보호된 병합 성공.
2. 현행 `ekodi-auth` 백업·스키마 충돌 검토, **권한 있는 운영자 승인과 보호된 D1 마이그레이션** 이후에만 원격 데이터 생성 기능을 활성화.
3. 중앙 관리자 로그인 세션·프로젝트 격리·버전 충돌·감사 이벤트의 운영 실증.
4. PC/모바일 실제 관리자 UI, 수매계약 검토 게이트, 납품 검수권한, 회계자료 원장/증빙 연결 순으로 확대.
5. 기존 재배 계산기·공개 사이트는 무인증 읽기 전용으로 유지하고, 실제 회계/금융 데이터와 혼동하지 않는다.

이 파일과 코드 병합만으로 DB 마이그레이션이 적용되거나 실제 계약·납품이 체결되었다고 보고해서는 안 된다.

**릴리스 격리:** `schemas/ekodibiz/doraji-draft-ledger.sql`은 자동 적용되는 `migrations/**` 밖에 보관한다. 실제 이행은 데이터 백업·운영자 최종 승인·별도 보호된 PR에서 `migrations/`에 편입하는 경우에만 가능하다.
