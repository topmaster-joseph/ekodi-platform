# 청계패스 운영 관리자 화면의 독립 스크립트 런타임 오류 — 보호 수정 기록

## 실제 EKODI Chromium 운영 증거

- 자체 브라우저 실행: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39082091484
- 증거 artifact: `ekodi-background-browser-39082091484-1`
- 비로그인 PC 1440×900 Chromium, `https://ekodi.kr/cheonggyepass/admin`: HTTP 200, 그러나 본문 비어 있음.
- `/cheonggye/local-region-admin-auth.js`: `ReferenceError: __name is not defined` (`clientMain9` line 19).
- `/cheonggye/cheonggyepass-vendor-intake-ui.js`: 같은 오류 (`clientMain12` line 9).
- 청계패스 공개 페이지는 HTTP 200/수평 넘침 없음. 전체 워크플로 runtime-smoke **실패**. Google 로그인과 PR·ZIP·API 접수도 성공으로 판정할 수 없음.

## 원인

Cloudflare Worker용 빌드 과정에서 함수/화살표 함수의 이름을 유지하기 위한 esbuild `__name(target,value)` 보조 호출이 `clientMain.toString()`으로 직렬화된 외부 브라우저 스크립트 안에도 들어간다. Worker 최상위에 있던 보조함수는 직렬화되지 않으므로 브라우저에서 `ReferenceError`가 발생한다. 동일 패턴의 청계 지역 공개·관리자·모듈·산림 스크립트 8개가 잠재 영향 범위다.

## 최소 보안 수정

개별 외부 스크립트 응답을 `(()=>{const __name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});\n(/* clientMain */)();})();` 형식으로 감싼다.

- 보조함수 정의를 **각 Script 자체의 private lexical scope** 안에 둠. 두 스크립트가 한 페이지에서 순서대로 로딩돼도 전역 `const __name` 선언 충돌 없음.
- esbuild의 원래 `__name` 계약과 동일한 동작으로 함수 이름만 보존한다.
- API 핸들러/Cloudflare 라우팅, Google 인증 방식, 복귀 URL, 업체 권한 및 D1/R2 접수·결제·개인정보 처리 로직은 변경하지 않음.
- 외부 JS 경로의 기존 `text/javascript`, `cache-control:no-store`, `nosniff` 헤더 유지. CSP에 `unsafe-inline`을 추가하거나 권한을 완화하지 않음.

## 검증 및 잔여 보호 단계

1. `node --test test/local-region-standalone-esbuild-name.test.mjs`가 8개 응답의 이름 보조함수 격리 및 2개 파일 동시 VM 로드를 검사.
2. 전체 GitHub CI·오케스트레이션·최신 main 충돌 검사.
3. 이 신규 코드 커밋에 대한 **새로운 소유자 정확한 SHA Human Gate** 없이는 보호 병합·배포 금지.
4. 공식 EKODI 오케스트레이터 경로로만 Site Core 배포, 자동 롤백/스테이징 유지.
5. EKODI 자체 Chromium으로 `/cheonggyepass/admin` PC·모바일을 다시 검증. `__name` 오류 0, 본문 정상, Google 로그인 선택·복귀 정상 확인.
6. 이후 별도 실계정 승인 하에 외주사 PR/ZIP/API 저장·관리자 검토와 비공개 R2/D1 이력 확인. **이 PR 자체로 실인증/실저장 성공 주장 불가**.

별도로 일부 페이지에서 CSP inline-style 차단 로그가 존재한다. 이번 PR은 CSP 전역 완화 없이 자바스크립트 결함만 수정하며, 추후 화면 배치 문제가 실제로 남을 경우 별도 검토한다.

관련 추적: https://github.com/topmaster-joseph/ekodi-platform/issues/5238
