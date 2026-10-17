# 청계패스 PC·모바일 Chromium 검증 절차

## 목적과 판정 구분

정식 화면: \`https://ekodi.kr/cheonggyepass/admin\`.

기존 2026-10-18 소스 PR #5203/#5214에서는 서버 접수·격리·감사원장 흐름을 **모의 관리자/외주사 신원 + SQLite + R2 fixture**로 확인했다. 이 문서의 Chromium 스크립트는 공개 운영 페이지에서 제공되는 실제 HTML/CSS/JS를 로드하되, 인증 API와 쓰기 요청은 격리 Chromium 안에서만 모의 처리한다.

**아래 둘은 전혀 다른 증거다.**
1. \`native-synthetic-ui\`: 실제 PC·모바일 Chromium 브라우저로 폼 전환·반응형·접수·검토 UI 조작을 수행하되 **Google 인증·운영 DB/R2 저장은 검증하지 않음**.
2. \`live-google-operational-crud\`: 실제 사전 등록된 Google 관리자/외주사 계정으로 실서비스에서 접수·검토·저장·격리까지 확인. 인증 서버, 실제 D1·R2 및 저장 이력 증거가 있어야 완료.

## 1. EKODI 소유 Chromium으로 격리 UI 점검

필요: 공식 EKODI 코드 체크아웃, Node.js 24, 별도 설치한 \`playwright@1.55.0\`와 Chromium. 업무 브라우저 세션이나 PC에 로그인된 Google 계정 프로필을 복사하지 말 것.

\`\`\`bash
npm install --no-save --package-lock=false playwright@1.55.0
npx playwright install chromium
node --check scripts/verify-cheonggyepass-native-ui.mjs
node --test test/cheonggyepass-native-browser-contract.test.mjs
node scripts/verify-cheonggyepass-native-ui.mjs
\`\`\`

산출물: \`artifacts/cheonggyepass-native-ui/report.json\` 및 \`pc-vendor.png\`, \`pc-admin.png\`, \`mobile-vendor.png\`, \`mobile-admin.png\`.

검증 내용:
- 1440px PC, 390px 모바일. 가로 넘침 2px 초과 시 실패.
- 비로그인 청계패스 관리자 진입 시 Google 로그인 페이지로 이동하고 return_to 유지하는지 확인. Google 계정 선택창에 직접 로그인한 것은 아님.
- 허용된 외주사 화면에서 GitHub PR, 외부 API 문서, 작은 무해 ZIP 형태의 UI 접수 동작을 Chromium으로 조작. 실제 운영 POST는 모두 가로채며 서버에는 전송하지 않는다.
- 외주사는 타 외주사 건을 볼 수 없고 검토 버튼도 보이지 않는지 확인.
- 관리자가 모의 접수 4건을 조회, GitHub 접수 반려, ZIP의 검사 전 승인 옵션 없음 확인.
- 전 과정에 JavaScript 예외·우회된 인증 요청·운영서버 POST가 있으면 실패.

이 스크립트는 실행 환경의 Playwright 설치와 네트워크 접근이 필요하다. 파일을 저장소에 추가한 사실만으로 위 UI 런타임 검증이 성공했다는 뜻은 아니다.

## 2. 실제 Google 인증·접수 검증 — 사전조건

운영 데이터나 타 업체 자료 훼손 금지. **사용자 또는 인증된 관리자의 명시적 승인으로 확보한 시험 전용 계정**만 사용하고, 비밀번호·Google OAuth 토큰·R2/D1 비밀값은 PR, 로그, 채팅 등에 올리지 말 것.

1. 최고관리자 2개 중 승인된 한 계정으로 \`/cheonggyepass/admin\` 로그인. 계정 선택창이 정상이며 로그인 후 동일 관리 경로로 복귀하는지 확인. \`/api/local-access/cheonggye-pass/me\`의 \`authenticated\`, \`role\`, \`capabilities\`, \`canManageAccess\` 응답을 **비밀값·실제 이메일 제외**하고 증거화.
2. \`/cheonggye/admin/access?scope=cheonggye-pass\`에서 외주사 검증용 Google 이메일에 \`external_vendor\` 또는 \`external_developer\`를 기간 제한으로 등록. 외주사에 운영 배포·금융·타 조직 데이터 권한을 주지 않음.
3. 외주사 브라우저의 독립 프로필로 로그인하여 본인 접수만 보이는지 확인. 검증 가능 PR URL과 정확한 SHA를 테스트 데이터로 접수; 접수 ID 및 \`submitted\` 상태, 본인 재조회 증거.
4. 외주사에게 테스트 전용 공개 HTTPS API/문서 주소를 제출하게 하고, \`health\`를 필수로 포함. URL 등록만 검증; 외부 URL 호출과 금전거래는 금지.
5. ZIP 테스트는 실행 코드가 없는 8MB 이하의 무해 ZIP 파일 사용. 브라우저 UI 업로드 후 응답 SHA-256과 \`quarantined\` 상태, **비공개 R2 존재** 및 D1 기록을 승인된 서버측 감사 도구로 읽기 전용 확인. ZIP이 검사 전 \`approved_for_testing\`이 되지 않는지 확인. 외주사에게 버킷 전체 접근권을 주지 않음.
6. 최고관리자로 다시 접속해 해당 접수건에 검토 메모를 남기고 \`review_pending\`/반려가 기록되는지 확인. 다른 외주사에게 검토 기능이나 타 외주사 데이터가 노출되지 않아야 함.
7. PC 1440px, 모바일 390px에서 각각 증거 확보. 실계정 인증을 모의 세션·테스트 훅으로 바꿔 성공이라 보고하면 안 됨.
8. 시험용 레코드가 운영에 남으므로 접수 시 \`QA-TEST-\` 식별자를 포함하고 사후 처리 정책에 따라 별도 승인 하에 보관/폐기. 현재 접수 API에는 DELETE 엔드포인트가 없으므로 임의 SQL 삭제 금지.

완료 판정: 실제 두 역할의 Google 인증, PR·API·ZIP 실제 저장, 접근 분리, 관리자 검토, PC/모바일, 감사/격리 증거가 모두 있어야 \`live-google-operational-crud=pass\`.

## 실행 환경 제약

이 작업 시점 Desktop Commander는 월간 실행 사용량을 모두 소진, Opera Browser Connector는 연결되지 않음, Browser 연결은 원래 브라우저 컨텍스트 밖에서 사용할 수 없었음. 따라서 본 문서는 실계정·서버 쓰기 실증을 완료했다고 주장하지 않는다.

향후 자동화는 공식 오케스트레이터의 보안 검토를 거친 격리된 브라우저 실행환경에서만 수행할 것. 실계정/OAuth 세션을 CI의 일반 PR 워크플로에 삽입하지 말 것.
