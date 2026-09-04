# Public Site Maintenance Mode

## 적용 대상

- `cgma.or.kr`
- workspace_id: `cgma`

## 기본 상태

`cgma.or.kr`은 기본값으로 `maintenance` 상태를 가진다.

방문자가 `https://cgma.or.kr/`에 접속하면 기본 임시페이지가 표시된다.

기본 문구:

- 제목: `현재 사이트 개발중입니다`
- 안내문: `더 좋은 서비스로 준비 중입니다.`

## 관리자 기능

관리자페이지에서 공개 사이트의 표시 방식을 선택할 수 있다.

설정 항목:

- 공개 상태: `public` 또는 `maintenance`
- 임시페이지 방식: `default` 또는 `url`
- 지정 주소: `http` 또는 `https` 주소만 허용
- 연결 방식: `button` 또는 `auto`
- 임시페이지 제목
- 임시페이지 안내문

## API

### 목록 조회

```http
GET /api/control/public-sites
```

### 사이트 설정 변경

```http
PUT /api/control/public-sites/{site_id}
```

예시 body:

```json
{
  "publicStatus": "maintenance",
  "maintenanceDisplayType": "url",
  "maintenanceRedirectUrl": "https://ekodi.kr/cgma",
  "maintenanceTitle": "현재 사이트 개발중입니다",
  "maintenanceMessage": "더 좋은 서비스로 준비 중입니다.",
  "redirectMode": "button"
}
```

## 보안 원칙

- iframe 삽입이 아니라 기본적으로 버튼 이동 또는 리디렉션을 사용한다.
- 지정 주소는 `http` 또는 `https`만 허용한다.
- 관리자 API는 기존 관리자 인증 세션을 통과해야 한다.
- 변경 기록은 감사 로그에 `public_site.update`로 남긴다.

## 관련 파일

- `api-worker.js`
- `admin-authenticated-shell.js`
- `admin-public-site-controls.js`
