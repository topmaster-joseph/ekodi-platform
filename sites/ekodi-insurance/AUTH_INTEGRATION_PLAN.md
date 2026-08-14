# EKODI Insurance Central Auth Integration Plan

기준일: 2026-08-15

목표: EKODI Insurance를 기존 `auth.ekodi.kr` 통합 Google 인증에 연결하되, 보험·건강 데이터의 저장과 인증 데이터의 처리를 분리한다.

## 현재 EKODI Auth 패턴

기존 Community는 다음 흐름을 사용한다.
1. 사용자가 서비스에서 `https://auth.ekodi.kr/?site=<realm>`으로 이동
2. 중앙 인증에서 Google ID 확인
3. 중앙 인증이 일회성 token hash를 서비스 return URL의 fragment에 전달
4. 서비스가 Supabase Auth `verifyOtp`로 토큰을 교환
5. fragment를 URL에서 제거하고 세션 유지

Insurance는 이 패턴을 그대로 복사하지 않고, 아래 게이트를 통과한 뒤 연결한다.

## Realm 제안

운영 전 공유 Auth 변경 검토 시 후보 설정:

```js
'insurance': {
  name: 'EKODI Insurance',
  returnTo: 'https://ins.ekodi.kr/',
  open: true,
  kind: 'insurance'
}
```

스테이징은 운영 return URL과 섞지 않는다. 별도 staging realm 또는 허용된 staging callback을 사용한다.

## 인증 후 저장 원칙

Auth 세션에 저장 가능
- EKODI user id
- 이메일/표시명 등 계정 식별 최소정보
- 서비스 접근권한

Auth 세션/공용 프로필에 저장 금지
- 질병명·진료내용
- 보험증권 상세
- 보험금 청구내역
- 상담 중 입력된 건강정보

보험 데이터는 향후 `insurance_*` 전용 저장영역 또는 전용 API에만 저장하고, 계정 식별자는 사용자 소유권 확인을 위한 foreign key로만 사용한다.

## 역할 제안

- `insurance_user`: 자신의 데이터만 조회·수정·삭제
- `insurance_advisor`: 사용자가 명시적으로 공유한 상담 건만 접근
- `insurance_admin`: 운영·권한 관리. 원칙적으로 건강정보 원문 접근 금지
- `insurance_auditor`: 감사로그만 조회

상담자는 이메일 주소만 알고 있다고 해서 보험정보를 조회할 수 없어야 한다.

## 공유 Auth 변경 전 회귀검증

필수 테스트
1. Community Google 로그인 정상
2. Mall Seller Google 로그인 정상
3. 기존 고객 realm 사전등록 로그인 정상
4. 잘못된 insurance callback 차단
5. token hash URL fragment 제거
6. 로그아웃 후 보험 화면 세션 제거
7. 보험 데이터 API가 다른 user id 요청을 거부

## 단계적 활성화

### Phase A · 현재
- Insurance 로컬 저장
- 중앙 Auth 미연결

### Phase B · 인증만
- 통합회원 로그인
- 보험 데이터는 여전히 브라우저 로컬
- 로그인은 기기 간 동기화 기능을 의미하지 않음

### Phase C · 암호화 저장
- 별도 민감정보 동의 완료 사용자만 서버 저장
- 최소권한 API 및 감사로그
- 로컬 → 서버 이전은 사용자 명시 동작으로만 수행

### Phase D · 상담 공유
- 사용자가 특정 상담 건을 선택해 공유
- 공유 범위·담당자·보유기간 표시
- 공유 철회 기능

## 금지

- Auth realm 추가와 동시에 보험 데이터를 공용 `ekodi-auth` 테이블에 넣는 것
- 로그인했다는 이유만으로 기존 로컬 보험정보를 자동 업로드하는 것
- 관리자 계정에 보험 데이터 전체조회 권한을 기본 부여하는 것
- 운영 `auth.ekodi.kr` 수정 후 Insurance만 확인하고 다른 realm 회귀검증을 생략하는 것
