# EKODI Claude Code 네이티브 실행기 — 도구 권한 경계 수정

**작업 #8748 · 상위 #7796 / #8745**

## 검증된 CLI 의미

Claude Code 공식 CLI 문서:

- [CLI reference](https://code.claude.com/docs/en/cli-reference): `--allowedTools`는 *승인 없이 실행할 수 있는 도구의 허용 규칙*을 추가할 뿐, 사용 가능한 도구 목록에서 다른 도구를 제거하지 않는다.
- 같은 문서의 `--tools`는 **실제 내장 도구 목록을 제한**하고, `--disallowedTools 'mcp__*'`는 MCP 도구를 제거한다. `--restricted`는 명령 실행과 WebFetch를 기본적으로 제거하고 파일 도구를 작업 디렉터리로 제한한다(Claude Code v2.1.248 이상).
- `--permission-mode plan`만으로 모든 명령 실행 도구가 제거되는 것은 아니므로 도구 목록 제한과 같이 사용한다.

기존 `--allowedTools Read,Grep,Glob`만으로는 Bash·웹·MCP 도구의 존재 자체를 제한할 수 없었다. AI 가족 자동 배정의 읽기 전용 신뢰 경계로는 충분하지 않았다.

## 수정 계약

미활성 네이티브 실행 계획의 Claude Code 인자를 다음 조합으로 고정한다.

```text
claude -p --restricted --permission-mode plan --tools Read,Grep,Glob --disallowedTools mcp__* --max-turns 4 --output-format text
```

- `--allowedTools` 제거. 이 코드는 권한을 *자동 승인*하기보다 도구를 *제거*한다.
- 브라우저 자동화·Bash·쓰기/편집·MCP 세션을 도구 목록에서 제외한다.
- 실제 `node.exe`/CLI 스크립트 경로 허용목록, 바이너리 SHA256, 비승격 Windows 사용자, OAuth 구독 확인, 사용자 서명 동의, 영속 nonce, lease 갱신, 비용 0원 정책은 변경하지 않는다.
- Codex CLI의 `--ignore-user-config`, 읽기 전용 sandbox 계약도 유지한다.
- `AI_ROUTE_FAMILY_AUTO_DISPATCH` 기본 false를 변경하지 않는다. CI 테스트는 도구 계획의 형태만 검증하며 실제 Windows 구독 실행 성공을 의미하지 않는다.

## 운영 검증 전 필수

실제 사용자 계정에서 **동일한 비승격 세션의 Claude Code 2.1.248 이상**이 `--restricted`와 `--tools`를 지원하는지 `--help`/버전 및 검증 가능한 모의 작업에서 확인한다. 알 수 없는 버전이나 거부된 옵션은 다른 광범위한 권한으로 자동 폴백하지 말고 실패 폐쇄한다. Windows 실제 권한·토큰·프로세스 트리·정책 준수·읽기 전용 동작·OAuth·작업 응답·비용·관리자 로그인 E2E가 확인될 때까지 운영 자동 실행을 켜지 않는다.

작업 PR은 EKODI Orchestrator의 격리 브랜치 → authentic CI → 공식 `orch_recovery` → 보호된 릴리스 경로만 따른다.
