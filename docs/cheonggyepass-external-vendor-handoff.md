# 청계패스 외부업체 통합 납품·검증 게이트

## 서비스 및 데이터 소유 경계
- 정식 공개 주소: https://ekodi.kr/cheonggyepass
- 정식 관리 주소: https://ekodi.kr/cheonggyepass/admin
- 청계잇다 연결: https://ekodi.kr/cheonggye/pass
- 청계면상인회 회원·회비·회계·문서는 /cgma에서 분리 보존.
- 공급자 상태: unassigned; 금전거래/정산은 미활성. 공급업체 전환이 지역플랫폼 소유권을 이전하지 않는다.
- 외부업체 접수 UI는 관리자 인증 후 해당 권한에서만 표시되며 공개 홈페이지에는 나타나지 않는다.

## 납품 방식 A — 전체 소스
- GitHub Pull Request HTTPS 주소와 선택적 40자리 정확한 커밋 SHA 접수.
- 또는 ZIP 최대 8MiB를 PK 매직·SHA-256 검사 후 비공개 R2 격리 저장소에 저장.
- 파일을 접수 즉시 압축 해제·실행·배포하지 않는다. ZIP이 격리 상태라는 사실은 무해성을 뜻하지 않는다.
- 깃 이력, 의존성·SBOM·라이선스·악성코드·보안 취약점 및 DB 변경 검사는 공식 격리 검증 파이프라인에서 별도 수행한다. 이 단계는 아직 미구현이다.

## 납품 방식 B — 외부 시스템 API
- HTTPS API 기본 주소, HTTPS 문서 주소, 기능 목록을 접수하며 health 기능을 반드시 포함한다.
- 접수 단계에서는 공급업체 제공 URL로 네트워크 요청을 하지 않는다. 공개 IP/TLS/DNS 재검증 및 요청량 제한을 갖춘 별도 격리 실행기에서 승인된 API만 테스트해야 한다.
- 기존 regional-commerce-program-contract.js 계약에 정의된 health, merchant-sync, benefit-sync, transaction-summary-read, settlement-summary-read, signed-webhook-verification을 준수한다.
- 현재는 API 접수·명세 검토만 구현한다. 공급자 엔진의 실거래·정산·포인트 이동은 활성화하지 않는다.

## 업체 납품 필수 자료
- 전체 소스/README/빌드 방법, 버전/라이선스, 수정·재사용·유지보수 권한
- PR/ZIP, 정확한 Git SHA, lockfile 및 SBOM
- 비파괴 DB 스키마 마이그레이션 및 테스트 시드
- API 명세, 테스트 인스턴스, 서명 웹훅 검증 및 실패 재시도 규약
- 테스트 데이터 (실제 개인정보 없음)
- 현금성 쿠폰/포인트/상품권/정산 해당 시 승인 사업자·정산 책임 계약
- 접수 폼에는 API 키, 비밀번호, DB 접속정보, 결제·정산 비밀키를 입력하지 않는다.

## 인프라 준비 및 순서
1. Cloudflare 관리 권한으로 공개 도메인 없는 전용 R2 버킷 ekodi-pass-vendor-quarantine 생성·검증.
2. Control API의 PASS_VENDOR_QUARANTINE 바인딩이 위 버킷을 가리키는지 확인.
3. migrations/0151_cheonggyepass_vendor_intake.sql을 보호된 증분 마이그레이션으로 적용. 기존 테이블은 변경·삭제하지 않음.
4. 청계패스 외부업체 권한은 /cheonggye/admin/access에서 기간과 GitHub 신원을 등록. 운영 배포·회원명부·재무·비밀키 권한은 금지.
5. 격리 브랜치, 충돌·CI·Human Gate·스테이징·롤백·실운영 확인을 거친 후에만 새 라우팅 배포.
6. 실제 원본 소스 및 운영 데이터 이전은 별도 검토와 승인이 있어야 한다.

## 접수 API
- GET /api/cheonggyepass/vendor-intake : 인증 및 scoped capability 검사. 관리자는 최근 50건, 외부업체는 본인 접수만.
- POST /api/cheonggyepass/vendor-intake : delivery = github_pr | zip | external_api, vendorName, 방식별 메타데이터. Authorization Bearer, x-ekodi-intake-request: 1, Idempotency-Key 필수.
- POST /api/cheonggyepass/vendor-intake/{id}/upload : ZIP 격리, SHA-256, 크기 제한, 본인 소유권 검사. 미연결 R2는 503, 절대 공용 URL 반환하지 않음.
- POST /api/cheonggyepass/vendor-intake/{id}/review : 관리자만 상태 변경. ZIP은 이 경로로 테스트 승인될 수 없음.
- 접수 API는 zip 다운로드·압축 해제·임의 코드 실행·공급자 URL 요청·운영 배포 기능을 **제공하지 않는다**.
- 중요 상태: submitted, quarantined, review_pending, approved_for_testing, rejected. approved_for_testing은 운영 승인이나 금전거래 활성화가 아니다.

## 필수 실서비스 증거
- 별도 버킷 연결, D1 증분 마이그레이션, 기존 CGMA 데이터 보존 확인.
- 실제 Google 인증으로 관리자·외부업체 권한 구분; 본인 외 데이터 비노출 확인.
- PR 제출, ZIP 격리, API 명세 접수, 이중 접수·사설 주소·교차 출처·초과 파일 및 잘못된 역할 차단.
- 필수 CI/충돌/오케스트레이터 출처/승인/스테이징/PC·모바일/배포/자동 롤백 확인.
- 운영 결과 증거 없이는 완료 보고 금지.
