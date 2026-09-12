# EKODI Kakao Personal Agent

EKODI Social 관리자에서 사용자가 메시지 내용과 수신 친구를 최종 확인한 뒤, 카카오의 공식 KakaoTalk Message API로 개인 메시지를 보내는 승인형 클라우드 모듈이다.

## 운영 원칙

- 카카오 비밀번호를 EKODI에 저장하지 않는다.
- Kakao OAuth 2.0으로 `friends`, `talk_message` 동의만 위임받는다.
- 액세스/리프레시 토큰은 서버에서 AES-GCM으로 암호화해 D1에 저장한다.
- 친구 목록은 카카오 API에서 필요할 때 조회하며 EKODI DB, localStorage, sessionStorage에 저장하지 않는다.
- 발송 이력에는 친구 이름이나 UUID를 남기지 않고 요청 ID, 수신자 수, 성공/실패 수, 링크 호스트, 시간만 기록한다.
- 모든 발송은 관리자 화면의 최종 승인 체크를 요구한다.
- Kakao API의 1회 최대 5명 제한에 맞춰 서버가 5명 단위로 나누어 전송한다.
- EKODI 자체 안전장치로 한 번의 승인 최대 25명, 최근 24시간 성공 발송 최대 100명을 적용한다.

## Kakao Developers 설정

1. Kakao Developers에서 앱을 생성하거나 기존 앱을 사용하고 Biz 앱 요건을 갖춘다.
2. Kakao Login을 활성화한다.
3. Redirect URI에 아래 주소를 정확히 등록한다.

   `https://api.ekodi.kr/api/control/social/kakao/callback`

4. 동의 항목에 `friends`와 `talk_message`를 설정한다.
5. 카카오톡 친구 API 및 친구 메시지 API 추가 기능 사용 권한을 신청한다. 심사 전에는 앱 멤버를 이용한 테스트 범위에서 실증한다.
6. 메시지 버튼에서 사용할 웹 링크 도메인을 Kakao Developers의 허용 도메인/제품 링크 설정에 등록한다.

## Cloudflare Worker Secret

실제 값은 저장소에 커밋하지 않고 Control API Worker의 Secret으로만 저장한다.

- `KAKAO_REST_API_KEY`
- `KAKAO_CLIENT_SECRET`
- `KAKAO_REDIRECT_URI=https://api.ekodi.kr/api/control/social/kakao/callback`
- `KAKAO_TOKEN_ENCRYPTION_KEY` 긴 무작위 비밀값
- 선택: `KAKAO_ADMIN_RETURN_URL=https://admin.ekodi.kr/#social`

`KAKAO_TOKEN_ENCRYPTION_KEY`는 운영 중 임의 변경하면 기존 토큰을 복호화할 수 없으므로, 변경 시 카카오 계정을 다시 연결해야 한다.

## 관리자 사용 흐름

1. `admin.ekodi.kr/#social`에서 **Kakao 개인메시지** 카드로 이동한다.
2. **카카오 연결**을 눌러 OAuth 동의를 완료한다.
3. 링크와 200자 이내 메시지를 확인한다.
4. **친구 불러오기**를 눌러 현재 API에서 조회 가능한 친구를 확인한다.
5. 최대 25명까지 선택한다.
6. **메시지와 대상자를 최종 확인했습니다**에 체크한다.
7. **승인하고 개인 카톡 보내기**를 누른다.
8. 발송 결과는 성공/실패 건수로만 관리자 이력에 남는다.

## API

- `GET /api/control/social/kakao/status`
- `POST /api/control/social/kakao/connect`
- `GET /api/control/social/kakao/callback`
- `GET /api/control/social/kakao/friends`
- `POST /api/control/social/kakao/send`
- `GET /api/control/social/kakao/history`
- `DELETE /api/control/social/kakao/disconnect`

## 현재 MVP 경계

공식 친구 API에서 조회되는 친구만 자동 개인발송 대상이 된다. 카카오 정책상 개인 계정의 모든 기존 친구를 서버 API로 임의 조회하는 기능은 제공되지 않는다. API 대상이 아닌 친구에 대해서는 향후 Kakao Share를 보조 경로로 붙일 수 있다.
