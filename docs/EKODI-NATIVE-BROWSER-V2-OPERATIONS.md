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
5. 각 대상 기기는 **최초에** 정식 EKODI Device Agent 2.6.2 이상을 공식 관리자 업데이트/기기 설치 경로로 설치해야 합니다. 오래된 Agent에는 신규 자동업데이트 코드가 없으므로 무단 업데이트를 하지 않습니다. 앱·운영체제·Chrome 브라우저 설치는 별도 관리입니다.
6. 25% → 100% 확대에는 새 보호 PR과 실제 기기 재시작·heartbeat·보안 확인이 선행돼야 합니다.

### 운영 완료 판정

PR 병합이나 Node 단위테스트만으로 완료라 하지 않습니다. 실제 EKODI 장치 heartbeat, 정확한 버전·능력 광고, PC 재시작 후 지속성, 단일 Chromium 프로필 격리, 운영 자동화 작업 응답, 실패 롤백 증거를 따로 요구합니다.

## 확인 명령

```powershell
node --test test/ekodi-native-browser-batch.test.mjs test/ekodi-native-browser-auto-update.test.mjs test/background-browser-worker.test.mjs
node scripts/validate-background-browser-worker.mjs
```
