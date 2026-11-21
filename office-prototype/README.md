# EKODI Office — 프리미엄 통합 허브 및 AI·소스 출처 안내

**범위:** https://ekodi.kr/office 와 /office/의 반응형 통합 화면. 이번 변경은 디자인·이용 안내·코드 출처·테스트만 다룹니다. 로그인, 새 문서 엔진, 기관별 저장 API, Windows 설치 파일이 아닙니다.

중앙 과제: https://github.com/topmaster-joseph/ekodi-platform/issues/9952
직전 공식 경로 복구: https://github.com/topmaster-joseph/ekodi-platform/pull/10003
별도 Windows 설치형 사전검증: https://github.com/topmaster-joseph/ekodi-platform/pull/9999

## 화면과 기능
- 정적 워크스페이스 콘셉트 화면, 기존 문서·제안서·교육 서비스에 대한 실제 링크, AI 연결 유형별 설명, 개인/조직/PC 탭, 출처·라이선스, 자주 묻는 질문을 한 페이지에서 안내합니다.
- /my/docs/, /proposal/, /edu/, /my/는 기존 소유 서비스이고, 오피스 허브는 어떤 파일도 열거나 저장하지 않습니다.
- 개인/조직/설치형 탭의 aria 및 키보드 조작은 유지됩니다. 새 AI 연결 버튼이나 API 키 양식을 만들지 않았습니다.
- 승인된 외부 출처 링크만 별도로 허용하고 target=_blank + rel=noopener noreferrer를 적용합니다.

## AI 연결 방식·비용
- OpenRouter의 무료 모델은 일반적으로 :free 식별자로 구분합니다. 계정 OAuth PKCE는 공급자가 처리하고 개인 소유 키를 사용합니다. 모델·무료 사용 한도·데이터 정책은 변경 가능하며, 이 허브에는 실제 OAuth 연결이 없습니다.
- Gemini 무료 티어는 모델·지역·계정 조건에 따라 이용할 수 있습니다. 이 웹 화면에 키를 입력하거나 보관하는 기능은 없습니다.
- OpenAI의 지원되는 개인·오픈소스 또는 참여 앱에서는 ChatGPT 요금제 사용량을 외부 앱에 허용할 수 있으나 자동·무제한이 아닙니다. 에코디 유료 기관용 웹 서비스에 개인 요금제 권한을 자동 공유한다고 주장하지 않습니다.
- Claude Code/Codex는 향후 공식 설치 프로그램과의 로컬 연동 후보입니다. 현재 EKODI Windows 오피스 설치본이 없습니다.
- 기관형은 합법적 API 계약과 비용·보안·역할·문서 저장 권한·감사 기능을 별도 검증한 뒤에만 제공할 예정입니다.
- 개인용 무료 제공자에게 보내는 원문은 제3자 서버로 이동할 수 있습니다. 검증 없이 기관의 비밀문서나 개인정보를 전송하지 않습니다.

공식 참고: https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
공식 참고: https://openrouter.ai/docs/guides/overview/auth/oauth
공식 참고: https://ai.google.dev/gemini-api/docs/pricing

## 코드 출처·저작권·라이선스
- 현재 office-prototype의 HTML/CSS/JS는 에코디 자체 통합 허브 코드이며 이음오피스 데스크톱 편집 엔진을 포함하지 않습니다.
- 이음오피스 소스 및 구조: https://github.com/pblsketch/ieumoffice . 미래 Windows 설치형 오피스를 위한 참고 프로젝트이며 실제 사용 시 Apache 2.0·NOTICE·상표·아이콘 등 권리를 별도 검증합니다.
- 이음오피스의 상위 기반 GenOffice: https://github.com/genspark-ai/genoffice . 일부 부분별 라이선스 및 비오픈소스 범위를 검토해야 합니다.
- Apache 2.0 원문: https://www.apache.org/licenses/LICENSE-2.0 . 실제 코드를 이식해 배포하면 적용 부품의 LICENSE/NOTICE/변경 사실/제3자 고지 의무를 준수합니다. 모든 에코디 소스나 브랜드가 자동으로 Apache 2.0이 되는 것은 아닙니다.
- 데스크톱 관련 office-desktop/rebrand-contract.json과 preflight.mjs는 검증 도구이며 Windows 실행 파일이 아닙니다.

## 보안과 배포
- 기존 canonical /office 와 /office/는 리디렉션 없는 직접 경로입니다. 현재 빌드·Site Worker allowlist·_headers 정책은 변경하지 않습니다.
- 프런트엔드는 새 서버 호출이 없으며, 기존 CSP connect-src 'none', form-action 'none', script-src 'self', no-store, noindex를 그대로 유지합니다.
- 문서 업로드/사용자 로그인/세션·토큰 접근/상호 운용되지 않은 고객 데이터 저장 기능을 이 허브에 추가하지 않습니다.
- node --test test/office-hub-prototype.test.mjs test/office-direct-route.test.mjs 후 공식 CI, EKODI 오케스트레이터의 task/receipt, 보호 PR, 운영 검증 필요.
- 320/360/390/768/1440 반응형 화면과 키보드 접근성 및 실서비스 스크린샷을 각 단계별로 확인해야 합니다.
