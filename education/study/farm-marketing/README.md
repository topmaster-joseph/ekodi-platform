# EKODI 농가 스마트폰 AI 홍보 실습실

- 정식 목표: `https://ekodi.kr/edu/study/farm-marketing/` (운영 배포와 경로 검증 전까지 목표 주소)
- 사이트 소유자: 기존 `education/` 자산을 제공하는 독립 Education Worker
- 기능: 7단계 180분 수업, 기초 스마트폰 안내, 농산물 홍보 글 초안 생성(템플릿), 외부 AI용 프롬프트, 내 기기에서 PNG 포스터 생성, 웹 공유, OX 퀴즈, 로컬 체크리스트
- 사용성: 모바일 우선, 큰 글씨 토글, 탭 키보드 사용 가능, URL `?step=1`~`?step=7`로 PPT 단계별 QR 연결
- 개인정보/보안: 로그인, 서버 저장, 사진 업로드, 원격 AI 호출, 비밀키 없음. 상품 정보와 체크 상태는 해당 기기의 localStorage에만 저장. 사진은 브라우저 메모리에만 유지.
- 외부 서비스 링크: ChatGPT와 BAND는 사용자가 직접 클릭할 때만 별도 창에서 열림. 유료 메시지 발송 등의 기능 없음.
- 법규/윤리: 국립농산물품질관리원의 통신판매 원산지 표시 안내, 카카오비즈니스 광고 메시지 안내에 공식 링크를 제공.
- 정적 호스팅: `index.html`, `styles.css`, `app.js` 세 파일이 같은 폴더에 있으면 작동. 빌드나 외부 CDN 필요 없음.
- 점검 항목: 모바일 320·390·768·1440px; step deep-link, 글 초안 복사, 포스터 사진 PNG 내보내기, localStorage restore, OX 퀴즈, no backend.
- 운영 완료 판단: protected main 병합 + Guarded Education Worker staging/production + live `/edu/study/farm-marketing/` 접속 검증이 반드시 필요. PR 생성 자체는 완료가 아님.