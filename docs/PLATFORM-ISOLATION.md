# EKODI Platform Isolation Architecture

## 목적

EKODI 생태계의 각 사이트와 서비스는 단순 페이지가 아니라 독립적인 플랫폼 또는 특수 기능입니다. 따라서 하나의 플랫폼 소스 수정이 다른 플랫폼의 배포, 인증, 결제, 데이터, 운영 상태에 불필요한 영향을 주지 않는 것을 기본 원칙으로 합니다.

## 운영 원칙

1. **플랫폼별 소스 경계**: 플랫폼 고유 소스는 가능한 한 전용 디렉터리·전용 Worker·전용 Pages 프로젝트에 둡니다.
2. **플랫폼별 배포 경계**: 자동 배포는 path filter로 해당 플랫폼 변경에만 반응합니다.
3. **전체 배포는 수동**: 전체 생태계를 한 번에 배포하는 workflow는 장애 복구 또는 명시적 통합 릴리스에서만 수동 실행합니다.
4. **공유 기능은 API 계약으로 연결**: 인증, 결제, 회계, 공용 고객 데이터 등은 파일을 직접 공유하기보다 안정된 API 계약을 통해 연결합니다.
5. **데이터 격리**: 외부 고객은 독립 tenant이며, 내부 브랜드도 사업·사역·회계 경계를 명시적으로 유지합니다.
6. **실제 도메인 검증**: 배포 성공 여부는 build 성공이 아니라 실제 production hostname 확인까지 포함합니다.
7. **되돌릴 수 있는 변경**: 큰 통합 변경보다 작은 독립 배포를 우선합니다.

## 현재 경계

### 독립성이 높은 영역

- EKODI Mall: Cloudflare Pages 전용 빌드/배포
- EKODI Books: 전용 Worker와 `books.ekodi.kr`
- Finance API: 전용 Worker와 `finance-api.ekodi.kr`
- Control API: 전용 Worker와 `api.ekodi.kr`
- Marketing AI 계열: 전용 동기화/고객 사이트 배포 흐름

### 아직 공유되는 영역

`site-worker.js`는 현재 다음과 같은 여러 도메인을 한 Worker에서 처리합니다.

- `ekodi.kr`
- `admin.ekodi.kr`
- `auth.ekodi.kr`
- `pay.ekodi.kr`
- `trade.ekodi.kr`
- mail/live 계열 gateway

따라서 이 Worker 자체를 수정하는 경우에는 이 도메인군이 동일한 배포 단위를 공유합니다. 이것은 Platform Isolation v2에서 역할별 Worker로 단계적으로 분리합니다.

또한 `service-proxy.js`는 `mall`, `church`, `lab`, mail 계열의 edge routing을 공유합니다. 이 파일은 특정 플랫폼의 일반 기능 코드가 아니라 **공용 edge infrastructure**로 분류하며, 수정 시 모든 연결 도메인의 regression verification이 필요합니다.

## 배포 모델

```text
Mall source ───────────▶ Mall workflow ───────────▶ Mall Pages
Books source ──────────▶ Books workflow ──────────▶ Books Worker
Finance source ────────▶ Finance workflow ────────▶ Finance Worker
Control/Auth API ──────▶ Control API workflow ────▶ API Worker
Admin/Auth UI ─────────▶ Admin workflow ──────────▶ Shared Site Worker (temporary)
Root/Gateway source ───▶ Site Core workflow ──────▶ Shared Site Worker (temporary)
Marketing AI ──────────▶ Marketing workflows ─────▶ Marketing/customer platforms

Shared-core emergency ─▶ Full Ecosystem Deploy ──▶ MANUAL ONLY
```

## 데이터 경계

현재 `api.ekodi.kr`과 `finance-api.ekodi.kr`은 동일한 `ekodi-auth` D1 데이터베이스를 사용합니다. Finance는 SQL table name을 `finance_*` namespace로 변환하여 충돌을 줄이고 있습니다. 이 구조는 당분간 유지하되 다음 원칙을 적용합니다.

- Finance table은 `finance_*` prefix를 유지합니다.
- Books 운영 table은 Books 전용 prefix를 유지합니다.
- customer tenant data는 tenant ID를 항상 포함합니다.
- 새 migration은 기능명을 파일명에 포함합니다. 예: `0012_finance_...sql`, `0013_books_...sql`.
- D1 migration 변경은 shared-core 변경으로 취급합니다.

향후 데이터량과 사업 중요도가 커지면 Finance, Commerce, Marketing 등은 별도 D1/PostgreSQL 프로젝트로 분리할 수 있습니다.

## Platform Isolation v2

다음 순서로 shared runtime을 분해합니다.

1. `admin.ekodi.kr` + `auth.ekodi.kr`을 Admin/Auth Worker로 분리
2. `pay.ekodi.kr`을 Payment Gateway Worker로 분리
3. `trade.ekodi.kr`을 Trading Worker 또는 독립 app으로 분리
4. `ekodi.kr`과 mail/live gateway만 Root/Gateway Worker에 유지
5. `service-proxy`에서 독립 custom-domain ownership이 가능한 서비스는 직접 연결로 전환
6. 각 플랫폼 별 health endpoint, release ID, audit log를 Control Center에 노출

## 변경 판단 기준

일반 개발자는 변경 전 다음 질문을 순서대로 확인합니다.

- 어느 플랫폼의 기능인가?
- 그 플랫폼 전용 소스 경계 안에서 해결할 수 있는가?
- 공유 Worker/API/DB를 반드시 수정해야 하는가?
- 공유 변경이라면 영향을 받는 플랫폼이 무엇인가?
- regression test와 production smoke test가 모두 준비되어 있는가?

공유 코드를 수정하지 않고 플랫폼 전용 설정·모듈로 해결할 수 있다면 항상 그 방식을 우선합니다.
