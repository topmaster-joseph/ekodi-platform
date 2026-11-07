# 서남권 국립의대 회계 · EKODI 단독 운영 경로

## 운영 결정 (2026-11-06)

만료되는 TinyFish 로그인 링크, 타사 브라우저 프로필 또는 원격 데스크톱 구독을 **필수 조건으로 사용하지 않는다.** 업무 실행은 인증된 EKODI 관리자 웹과 공식 EKODI API가 소유한다. 공개 화면 검증은 기존 EKODI Chromium/Playwright 워커와 Node 내장 HTTPS 검증기를 재사용한다.

| 단계 | 1차 운영 경로 | 보호 원칙 |
|---|---|---|
| 공개 활동이력 | `https://ekodi.kr/seonammedi/#committee-activity` | 기간·수입·지출·잔액 4개 항목 및 설명만 공개 |
| 관리자 원장 등록 | `https://ekodi.kr/seonammedi/admin/?panel=finance` | 기존 Google EKODI 로그인·`seonammedi.finance.manage` 권한 확인 |
| 민감 회계자료 | 관리자 PC에서 선택하는 로컬 JSON 파일 | 공개 GitHub·게시판·게스트 API에 세부내역 포함 금지 |
| 읽기 전용 UI 검증 | `scripts/verify-seonammedi-nav-guest-native.mjs` | EKODI 소유 Chromium, 두 도메인 × PC/모바일 |
| 공개/관리자 경계 점검 | `scripts/verify-seonammedi-finance-firstparty.mjs` | GET 전용, 쿠키·인증정보 없이 공개 4필드 및 401/403 확인 |

## 원본 회계보고 일괄 등록

1. 관리자가 **기존 EKODI 관리자 페이지에 직접 로그인**한다. Google 인증과 필요한 동의는 관리자 본인이 한다.
2. 회계 관리의 **회계보고서 원본 등록 · 관리자 전용**에서 사전에 금액 검증된 로컬 JSON을 선택한다.
3. 화면의 **합계 검증 후 일괄 등록**을 실행한다. 중단·재시도 시 동일 보고서 ID와 항목 번호로 중복을 확인한다.
4. 등록 목록에 비공개 항목이 있는지 관리자가 확인한다. 표지 기간 불일치·수입 거래일 미기재는 임의 확정하지 않고 관리 메모로 보존한다.
5. 공개 화면에는 세부 거래내역이 아닌 승인된 총괄 수치만 남는지 재검증한다.

**중요:** 파일이 채팅에 첨부되었다는 사실만으로 운영 서버에 데이터가 등록되지 않는다. 등록 결과를 API로 읽어 확인하기 전에는 '원장 등록 완료'라고 보고하지 않는다. 로그인 없는 읽기 전용 검증은 실제 원장 행의 존재를 증명할 수 없다.

## TinyFish 없이 실행하는 정기 검증

```sh
node --test test/seonammedi-finance-firstparty.test.mjs
node scripts/verify-seonammedi-finance-firstparty.mjs
```

기존 `.github/workflows/verify-seonammedi-nav-guest-native.yml`의 EKODI 네이티브 감사 작업에서 실행한다. 키·쿠키·금융정보를 출력하거나 저장하지 않고 결과에는 성공 여부·계약 코드·안전한 HTTP 상태만 남긴다. 서비스 오류나 권한 부족을 만료된 외부 프로필 링크로 우회하지 않는다.

## 복구와 책임

- UI 점검 실패: 기존 네이티브 Chromium 검사 → 공식 저장소 원인 수정 → CI/오케스트레이터 PR → 보호 배포 → 실서비스 재확인.
- 인증 만료: EKODI 공식 로그인으로 재인증, 공급자 OAuth 동의 또는 MFA는 사용자가 직접 수행한다.
- 회계 등록 미완료: 다시 같은 파일을 업로드하기 전에 기등록 여부를 확인한다. 타사 프로필·쿠키를 복제하지 않는다.
- 실행 장치 오프라인 또는 원격 도구 할당량 소진: read-only CI/공식 API를 우선 사용하고 원격 도구 구독 갱신을 필수 작업으로 전환하지 않는다.
- 이 변경은 **새로운 전권 자동 로그인, 관리자 권한 확장, 운영 원장 직접 쓰기, 결제·외부 데이터 전송을 허용하지 않는다.**

정식 완료는 보호 병합·배포·실서비스 증거까지 확인된 경우에만 선언한다.
