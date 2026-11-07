# EKODI Native Browser v2 · 성능·자동업데이트 운영계약

2026-11-04 기준: 외부 유료 TinyFish 계정에 의존하지 않는 에코디 소유의 Chromium/Playwright 워커입니다. TinyFish 대비 우월한 속도를 **입증했다는 의미는 아닙니다.** 같은 작업을 같은 기기/네트워크 환경에서 수행한 P50/P95 지표가 확보되기 전까지 상대 성능 표현을 금지합니다.

## 성능 및 실행

- 기존 `scripts/ekodi-background-browser-worker.mjs`는 표준 `ekodi.kr` 전용, 안전한 읽기 전용 작업을 수행하며 전역 작업시간, 30액션 제한, 요청 차단, 429 회로차단, 502/503/504 제한적 복구를 유지합니다.
- 새 `scripts/ekodi-native-browser-batch.mjs`는 1~12개 허용 경로를 중복 제거하고 한 번의 격리 Chromium 실행에서 모두 점검합니다. 각 경로에 snapshot을 보장하고, 스크린샷은 총 작업 30개 한도에서만 추가합니다.
- 결과에는 페이지별 소요시간과 P50/P95/최대 지연이 포함됩니다. 비밀번호, 쿠키, API 토큰, 수령인 연락처가 들어간 화면은 이 읽기 전용 배치에 넣지 않습니다.
- 접근 허용 대상은 기존 `ekodi.kr`와 명시된 staging만입니다. 도매꾹 등 외부 제공자 로그인은 **별도 EKODI-INTERACTIVE-AUTH-001** 사람 인증 세션에서만 수행합니다. 자동 워커의 외부 도메인 허용이나 기존 사용자 브라우저 프로필 재사용은 금지합니다.
- 자동발주, 주문결제, 고객 개인정보 전송은 이 브라우저 변경으로 활성화되지 않습니다.

### 실행 예시

```json
{
  "taskId": "native-batch-mall-admin",
  "paths": ["/ekodimall/", "/ekodimall/admin/", "/admin/"],
  "deviceProfile": "desktop",
  "screenshots": true
}
```

이 작업을 작업별 JSON 파일로 저장하고 공식 격리 실행기에 `node scripts/ekodi-native-browser-batch.mjs <task-file>`을 넘깁니다. 프로세스는 Playwright가 준비된 에코디 관리 런타임에서만 실행됩니다. 실행 완료 후 비밀정보를 제외한 증거를 감사 기록으로 수집합니다.

## Device Agent 자동업데이트

업데이트는 서명 없는 임의 웹 스크립트를 실행하는 것이 아니라, `EKODI-AGENT-AUTOUPDATE-001` 매니페스트 기반으로 수행합니다.

1. 에코디 오케스트레이터 공식 복구 PR, CI, 스테이징·운영 릴리스가 성공한 뒤 **실제 main 병합 커밋**에서 배포용 Agent 파일의 SHA-256을 확인합니다.
2. 별도 PR로 `config/ekodi-device-agent-release.json`을 제출합니다. 이는 `approved=true`, `channel=protected-orchestrator`, 정식 `sourceCommit`, `sha256`, 단일 고정 상대경로, `rolloutPercent=25`를 포함해야 합니다.
3. 설치된 Agent 2.6.2+는 하루에 한 번 승인 매니페스트를 읽습니다. 매니페스트 누락/위조/변경, 잘못된 버전, 해시 불일치, 25% 카나리 외 기기, 로컬 제외 설정, 사용 중인 외부 인증 세션에서는 **업데이트하지 않습니다**.
4. 적합한 기기는 고정된 Git 커밋에서 파일을 내려받아 SHA-256과 PowerShell 소스 검사를 확인한 뒤, 기존 트랜잭션 업데이트(백업·원자적 교체·heartbeat·롤백)를 호출합니다. 실패시 정형 코드만 로컬에 기록합니다.
5. 각 대상 기기는 **최초에** 정식 EKODI Device Agent 2.6.3 이상을 공식 관리자 업데이트/기기 설치 경로로 설치해야 합니다. 오래된 Agent에는 신규 자동업데이트 코드가 없으므로 무단 업데이트를 하지 않습니다. 앱·운영체제·Chrome 브라우저 설치는 별도 관리입니다.
6. 25% → 100% 확대에는 새 보호 PR과 실제 기기 재시작·heartbeat·보안 확인이 선행돼야 합니다.

### 운영 완료 판정

PR 병합이나 Node 단위테스트만으로 완료라 하지 않습니다. 실제 EKODI 장치 heartbeat, 정확한 버전·능력 광고, PC 재시작 후 지속성, 단일 Chromium 프로필 격리, 운영 자동화 작업 응답, 실패 롤백 증거를 따로 요구합니다.

## 확인 명령

```powershell
node --test test/ekodi-native-browser-batch.test.mjs test/ekodi-native-browser-auto-update.test.mjs test/background-browser-worker.test.mjs
node scripts/validate-background-browser-worker.mjs
```

## v2.1 업데이트 성공 판정 및 운영 성능 (2026-11-05)

- 신규 Agent 버전은 2.6.3입니다. 실제 업데이트 완료 여부는 기존 실행 인스턴스의 heartbeat가 아니라 **재시작한 새로운 Agent 버전**이 heartbeat를 성공적으로 전송한 후 기록합니다.
- 상태는 로컬에서 `installed-pending-restart` → `verified-after-restart`로 전환됩니다. 버전이 다르거나 상태 기록이 손상되면 성공으로 변경하지 않습니다.
- 관리자 heartbeat에는 비밀정보를 제외한 `nativeBrowserUpdateState.state`와 버전만 전달됩니다.
- 공식 브라우저 워크플로는 `navigationTimings` 및 `performance.p50Ms/p95Ms/maxMs`를 검사하고 실행 요약에 표시합니다. 이것은 에코디 자체 실행의 실제 지표이며 타사와 동일한 조건의 비교를 제공하지는 않습니다.
- v2.6.3 파일이 보호된 main에 병합되고 배포되더라도 기존 2.5.x/2.6.1 기기에 자동 설치되지 않습니다. 기존 Agent의 공식 명령에 의한 1회 부트스트랩과 현장 권한이 선행되어야 합니다.
- 자동업데이트 매니페스트는 공식 실기기 카나리 증거가 확인되기 전까지 생성·승인하지 않습니다.

## 독립 실행 모드 (2026-11-06)

에코디 브라우저는 별도 유료 브라우저 계정, 구독, 잔액, 접근 토큰 또는 외부 서비스 로그인 프로필을 필수조건으로 사용하지 않습니다. 실행 진입점은 `scripts/ekodi-independent-browser.mjs`이며, 보호된 오케스트레이터가 실행하는 Node/Playwright 작업자에서 사용합니다. 아래 명령은 실행 작업자의 Node·Chromium 설치가 필요하며 Cloudflare Worker 내부에서 직접 Chromium을 실행하는 것은 아닙니다.

- `public-readonly`: PC가 오프라인이어도 클라우드 실행 가능 시 에코디 자체 `ekodi-background-browser-worker`와 격리된 한 번의 Chromium 실행을 이용해 최대 12개 경로를 확인합니다. 실행 대상은 기본적으로 `https://ekodi.kr`의 허용 경로뿐입니다.
- `external-auth`: 이미 등록된 외부 사이트 중 하나를 에코디 디바이스에 연결할 때만 사용합니다. 정상 Agent와 PC 현장 동의가 없으면 `EKODI_NATIVE_AGENT_REQUIRED` 또는 `EKODI_HUMAN_LOGIN_CONSENT_REQUIRED`를 반환하며, 별도 유료 브라우저나 외부 서버에 인증정보를 전달하지 않습니다. 이 함수는 인증 창을 자동으로 실행하지 않으며, 기존 관리자 Control API 승인 절차를 통해 열어야 합니다.
- 클라우드 런타임이 준비되지 않은 공개 페이지 작업은 `EKODI_NATIVE_CLOUD_RUNTIME_REQUIRED`로 종료하고 장애 사유를 기록합니다. 타사 브라우저로 자동 전환하거나 결제 비용을 요구하지 않습니다.
- 비인가 변경·결제·주문·배송 개인정보 전송은 독립 실행 모드에 포함되지 않습니다.

### 작업 예시

```json
{
  "kind":"public-readonly",
  "taskId":"ekodi-independent-site-check",
  "paths":["/","/ekodimall/","/admin/"],
  "deviceProfile":"desktop",
  "screenshots":false
}
```

`node scripts/ekodi-independent-browser.mjs <task.json>`를 실행하면 자체 Chromium 검증 결과와 P50/P95를 반환합니다. `config/ekodi-browser-independence.json`에 독립성 가드를 고정하고, `scripts/validate-background-browser-worker.mjs`와 GitHub 브라우저 워크플로에서 실행 계약을 확인합니다.

**제약:** 브라우저 엔진의 독립 실행과 실제 PC 원격 제어, 외부 공급처 주문은 서로 다른 권한·실행 경로입니다. 구버전 Device Agent의 `EKA-121` 업데이트 장애 및 최초 현장 등록은 이 독립 실행 모드만으로 해결되었다고 간주하지 않습니다.
