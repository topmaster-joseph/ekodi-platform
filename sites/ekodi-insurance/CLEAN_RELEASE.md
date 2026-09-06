# EKODI Insurance · Clean Release

기준일: 2026-08-15

이 브랜치는 오래된 `staging/insurance-release-20260815`의 기능을 그대로 병합하지 않고, 최신 `main`에서 다시 시작해 **활성 Insurance 런타임만 선택 이식한 clean Release Candidate**다.

## 포함

- Cloudflare static assets + Worker 고객 UI
- Cloudflare Worker + D1 상담 API
- 브라우저 로컬 보험·청구·기본 AI 대화
- 필수 연락정보 동의 + 별도 선택 AI 대화 공유동의
- AES-GCM 연락처/선택 대화 암호화
- 고객 상담요청 철회 UI
- revoked D1 비식별화 trigger
- 30일 보유기간 cleanup
- 중앙 Admin 상담 queue/proxy
- clean D1 staging E2E
- approval-gated production Green workflow

## 의도적으로 제외

- Supabase 보험 업무 DB
- Supabase 보험 Edge Function 실험본
- 보험 전용 auth-staging 실험 디렉터리
- 과거 Postgres 보험 schema 초안
- 과거 분리 schema/auth CI

Supabase는 필요할 경우 기존 사용자 신원 확인에만 사용할 수 있으며, 보험 상담업무의 영속 데이터베이스로 사용하지 않는다.

## 운영

이 clean RC가 기술검증을 통과해도 보험모집·광고·개인정보 관련 외부 검토와 운영주체/상담책임주체 확정 전에는 `main`, `ins.ekodi.kr`, 운영 D1을 전환하지 않는다.
