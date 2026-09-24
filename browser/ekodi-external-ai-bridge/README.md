# EKODI External AI Bridge

선택형 로컬 브라우저 확장입니다. EKODI 최고관리자 명령창에서 사용자가 ChatGPT, Claude, Gemini, Qwen 또는 여러 AI를 명시적으로 선택한 경우에만 새 탭을 만들고 그 탭의 입력칸에 명령을 채웁니다.

보안 경계:
- 자동 전송 금지
- 외부 AI 답변 수집 금지
- 쿠키·암호·토큰 읽기 금지
- 기존 외부 AI 탭 감시 금지
- 프롬프트 URL 삽입 금지
- 1회 handoff는 chrome.storage.session에 최대 120초만 유지
- Bridge가 없거나 실패하면 EKODI 웹의 기존 새창+복사 폴백 사용

브라우저 보안상 확장은 사용자가 직접 설치하거나 조직에서 명시적으로 배포해야 하며 웹페이지가 몰래 설치할 수 없습니다.
