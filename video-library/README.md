# 에코디 영상서재 (ekodi.kr/video)

정적 웹앱 원본입니다. 실행 원본은 Vercel 프로젝트 `ekodi-video`(ekodi-video.vercel.app)이고,
에코디 라우터가 `/video` 경로로 연결합니다(`platform-route-registry.js`의 `video` 실행 표면).

- `index.html`: 앱 전체(인라인 CSS·JS). ekodi.kr/video의 CSP가 인라인만 허용하므로 외부 스크립트 파일로 나누지 않습니다.
- `manifest.webmanifest`, `icon-*.png`: 앱 설치용. 설치된 앱은 Chrome 122+에서 한 번 허용한 폴더 권한을 계속 유지합니다.
- 영상 파일은 서버에 올리지 않습니다. 각 PC·동기화 폴더에서 브라우저가 직접 재생합니다.
