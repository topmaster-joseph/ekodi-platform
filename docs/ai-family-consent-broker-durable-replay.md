# EKODI AI family — 사용자 동의 발급·재사용 차단 계약 (Phase 6)

**작업:** #8714. 상위 작업: #7796, #8621, #8636.

## 보안 경계

이 소스 변경은 **비활성·무설치·무연결 상태의 코드**다. 현재 사용자의 Windows PC에 Sidecar를 설치하거나 계정에 로그인하지 않고, 서명 비밀키·Device Agent 토큰·사용자 프롬프트·계정 이메일을 저장하지 않는다. Control API 운영 기능을 활성화하거나 Windows 관리자 권한 작업을 추가하지 않는다.

- `ai-family-consent-issuer.mjs`: 명시적 enabled=true, 별도 OS-인증 사용자 동의 요청기·증명 검증기·OS 보호키 서명기 모두 준비돼야 한다. 작업번호, 기기, 요청 식별 해시, CLI 공급자, 읽기전용 의도 및 만료를 사용자에게 확인할 최소 계약을 만든다. 가입·OAuth 갱신이나 유료 API 인증은 수행하지 않는다. 유효기간은 최대 10분, 실제 작업 만료 시각을 넘지 못한다.
- `ai-family-durable-nonce.mjs`: SQLite / Cloudflare D1식 `prepare().bind().run()`을 받지만 자체 연결하지 않는다. 배포 전 별도의 승인된 저장소에서 테이블·고유 인덱스 생성이 필수다. **nonce 기본키 + job_id 유일 인덱스**가 승인서 재사용뿐 아니라 동일 작업의 새로운 nonce 재시도도 거부한다. 원자적 INSERT 한 번에서 변경 행 수 1인 경우에만 실행을 허용한다. DB 장애/스키마 미설치면 실패 폐쇄.
- `ai-family-consent-broker.mjs`: 기존 `createWindowsNativeFamilySidecar`가 요구하는 `getSignedConsent / verifySignedConsent` 인터페이스에 두 모듈을 조합한다. 외부의 사용자 인증 UI, 실제 Windows 토큰, 서명키 보관, 독립 기기 큐 토큰, 실제 기기 실행은 이 코드에 포함되지 않는다.
- 테스트는 일시적 Ed25519 키를 메모리에서 생성하고 외부로 보내지 않는다. 원자적·지속적 동작을 표현한 fake DB에 더해, 지원되는 Node에서는 `node:sqlite` 실제 SQLite UNIQUE/ON CONFLICT 테스트를 실행한다. 이 테스트는 **실서비스 D1·Windows E2E가 아니다**.

## 전개·운영 승인 조건

1. 사용자 세션에서 동작하는 비승격 OS 승인 UI를 실제 구현하고 승인 확인을 위한 OS 신뢰 출처(서명·PID·세션 바인딩)를 검증한다. Boolean만 전달된 승인서는 권한 증거가 아니다.
2. Windows 계정 또는 OS 키 저장소에서 Ed25519 비밀키를 보관하고 서명만 위임한다. 저장소/로그/CI 및 관리자 권한 Device Agent에 비밀키 반입 금지.
3. D1 혹은 사용자 전용 SQLite에 최소권한을 갖춘 일회용 nonce 저장소를 승인된 migration과 접근 제어로 등록한다. 지역/워크스페이스 권한 문맥과 식별자를 최종 검증하고 재시작·동시 요청·중복 실행·취소 테스트를 통과한다.
4. 구독 기반 Codex·Claude Code 인증 실증, 최소권한 큐 토큰, 실행기 프로세스 종료·Lease 연장·실제 응답 수신증, 관리자 PC/모바일 UI·Workers 비용/CPU·오류율 검증을 완료한다.
5. 원본 PR 필수 CI, EKODI Orchestrator의 공식 `orch_recovery` PR, 보호된 staging/배포, 운영 성공 증거가 모두 확인되기 전에는 **`AI_ROUTE_FAMILY_AUTO_DISPATCH=false` 유지**. 이 PR은 활성화나 배포 승인서가 아니다.

실제 사용자 승인·금전·인증 권한을 확대하는 단계가 필요하면 EKODI 헌법·C2/C3 승인을 별도 확인한다.
