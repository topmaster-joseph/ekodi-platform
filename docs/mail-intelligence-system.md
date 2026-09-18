# EKODI Mail Intelligence

EKODI 운영 메일을 10분 간격으로 수집·분류·요약하고 중요 메일만 이메일로 알리는 독립 운영 모듈이다. ChatGPT 예약 작업이나 외부 유료 자동화 서비스에 의존하지 않는다.

## 처리 흐름
1. Gmail API에서 최근 메일을 읽는다.
2. EKODI 관련성을 판별한다.
3. 사람/기관, 사업/고객, 결제·계정·보안, 시스템, 사역으로 분류한다.
4. 긴급/중요/관찰/참고 우선순위를 부여한다.
5. 반복 GitHub 정상 알림은 억제하고, 실패 상태도 동일 상태는 6시간 내 중복 알림하지 않는다.
6. 긴급·중요 또는 조치 필요 메일은 `MAIL_ALERT_TO`로 즉시 발송한다.
7. 매일 08:00 KST 지난 24시간 요약을 한 번 발송한다.
8. D1에는 원문 전체가 아니라 메타데이터·요약·조치 상태만 저장한다.

## Google 연결
Cloudflare Worker secret 또는 GitHub Actions secret으로 다음 3개 값이 필요하다.
- `EKODI_GMAIL_CLIENT_ID` -> Worker `GMAIL_CLIENT_ID`
- `EKODI_GMAIL_CLIENT_SECRET` -> Worker `GMAIL_CLIENT_SECRET`
- `EKODI_GMAIL_REFRESH_TOKEN` -> Worker `GMAIL_REFRESH_TOKEN`

OAuth scope는 `https://www.googleapis.com/auth/gmail.readonly`와 `https://www.googleapis.com/auth/gmail.send`만 사용한다.

자격증명이 없을 때 Worker와 관리자 API는 정상 배포되며 상태는 `waiting_connection`으로 유지한다. 메일을 임의 삭제·보관·읽음 처리하지 않는다.

## 운영 API
- `GET /health`: 비인증 상태 확인
- `GET /api/mail/status`: 관리자 세션 필요
- `GET /api/mail/messages?limit=50`: 최근 분석 결과
- `POST /api/mail/run`: 관리자 세션 + `x-ekodi-confirm-impact: RUN`

관리자 API 인증은 기존 `https://api.ekodi.kr/api/session`을 재사용한다.
