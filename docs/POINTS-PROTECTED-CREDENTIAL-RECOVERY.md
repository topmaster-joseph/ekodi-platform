# EKODI Points — 보호된 자격증명 복구·실행 순서

이 문서는 #6739 / #7778에서 확인된 두 종류의 실행 차단을 해결하기 위한 **비밀정보 없는** 운영 인계서입니다. 사용자의 포인트를 적립·사용·전환·기부하도록 승인하는 문서가 아닙니다.

## 1. 운영 백업 드라이브 ACL 검사 (read-only)

- 실행: `.github/workflows/verify-points-backup-drive-acl.yml`의 `Verify Points Backup Drive Membership (Read Only)`.
- 보호된 GitHub Actions **production** 환경에 `EKODI_STORAGE_GATEWAY_KEY`가 누락되거나 연결되지 않으면 검사 시작 전에 중지합니다. 서비스 Worker 내부의 저장된 비밀키와 GitHub 환경 비밀키는 별도 저장 위치이므로 자동 공유된다고 가정하지 않습니다.
- 운영 권한을 위임받은 관리자는 **기존에 승인된** Storage Gateway 자격증명을 해당 보호 환경에서 안전하게 연결하고 허용된 주체만 사용할 수 있는지 확인해야 합니다. 값을 PR, 이슈, 로그, 채팅, 작업자 파일, 브라우저 주소 등에 입력하지 않습니다. 새 값을 무작정 발행해 운영 Worker와 비동기 상태를 만들지 않습니다.
- 그 뒤 현재 보호된 `main`의 불변 SHA를 기준으로 기존 read-only 검사 워크플로를 다시 실행합니다. `main`이 실행 도중 갱신되면 작업은 중단하고 새 최신 SHA로 다시 검증합니다. 이 검사는 직접 권한 확인만 하며 파일 생성, DB 변경, 포인트 활성화를 하지 않습니다.
- 응답의 실제 Shared Drive 승인 멤버십·하위폴더 상속·추가 직접 공유 부재 및 `backupExportAuthorized=false` 등을 확인해야 성공으로 기록됩니다.

## 2. 개발 브라우저 E2E Cloudflare Access

- 실행: `.github/workflows/verify-points-staging-browser.yml`의 `Verify Points Staging (EKODI Browser)`.
- **development** 환경의 정적 경로는 세 가지 기존 비밀 항목 `CF_ACCESS_STAGING_CLIENT_ID`, `CF_ACCESS_STAGING_CLIENT_SECRET`, `CF_ACCESS_STAGING_SERVICE_TOKEN_ID`가 **모두** 정확히 설정돼야 합니다. 일부만 있으면 새 임시 토큰을 만드는 쪽으로 우회하지 않고 실패합니다.
- 정적 토큰이 전혀 없는 경우에만 개발 계정 전용 임시 토큰을 만들며, Cloudflare가 `POST /access/service_tokens`에 403을 반환하면 실패를 유지합니다. 계정 소유자는 필요한 **최소한의 개발 서비스 토큰 생성·정리 권한 및 특정 두 개발 Access 앱의 정책 관리 권한**만 검토할 수 있습니다. 운영 Cloudflare 권한으로 대체하거나 `any_valid_service_token` 정책을 사용하면 안 됩니다.
- 모든 E2E 테스트 픽스처는 개발 프로젝트에만 생성하며 항상 run-scoped cleanup을 거쳐야 합니다. 누락된 권한을 대신하여 보호되지 않은 브라우저 접속이나 공개 권한 확대를 하지 않습니다.

## 3. 생산 자료에 대한 순서 및 완료 판정

1. 1번 read-only ACL 검사 통과 + 비밀키 보관·권한 주체 확인.
2. 운영자에게 별도 보호된 **age 공개 수신자 키**, 프로덕션 DB URL, 기존 Storage Gateway 자격증명 등 준비. 비밀 복호화 키는 독립 소유자가 보유하며 CI/챗에 업로드하지 않음.
3. `points-protected-logical-backup.yml`의 **수동 보호 환경 승인**으로 암호화된 애플리케이션 논리 백업, 실제 Drive 파일 readback 및 해시 검증. Supabase 논리 덤프는 관리형 Auth·Storage·객체 바이트·Edge Function 전체 복원을 보증하지 않음.
4. 독립된 격리 환경에 실제 복원하여 서로 독립된 두 담당자 서명 증빙을 확인하고 `verify-points-manual-backup-evidence.yml`에 전달.
5. 그 뒤에도 스키마 승격과 포인트 경제 기능은 별도의 인간 보안·재무 승인 및 단계적 서비스 검증이 필요. `POINTS_ENABLED=false`를 임의로 변경하지 않음.

### 판정

CI 통과, Storage Worker 배포, 백업 명세 문서 또는 미리 생성된 폴더만으로는 운영 백업/복원/포인트 활성화 완료로 처리하지 않습니다. 단 하나라도 확인되지 않으면 `blocked`로 보고 원인을 그대로 남깁니다.
