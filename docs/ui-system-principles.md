# EKODI UI Surface Principles

EKODI uses one shared UI Core with explicit surfaces for the official platform, general user sites, member workspaces, tenant administration, platform administration, and service administration.

The official `ekodi.kr` platform UI may present EKODI as the primary identity. General user sites keep their service, organization, store, project, or workspace identity primary and use EKODI only as underlying infrastructure or secondary relationship context.

All surfaces share accessibility, responsive semantics, state language, and reusable UI components. Surface-specific identity and navigation do not create separate product codebases.

Every canonical surface also inherits the mandatory EKODI construction standard from `config/design-engine.json`: **용이성, 지역성·현장성, 가독성, 독창성, 직관성, 소통형, 맞춤형**. The implementation may prioritize these differently by surface, but none may be materially omitted. Admin personalization remains within explicit role, task and authority boundaries; public personalization remains consent-based and anonymously usable.

## PUBLIC-SURFACE-ADMIN-001

EKODI의 모든 사용자·독립·하위 사이트는 **사용자 화면을 운영의 기준 화면**으로 사용한다. 인증된 관리자는 동일 화면에서 서버가 승인한 자신의 권한 범위 안에서 작성, 수정, 삭제, 검토, 공개, 정렬 등 운영 기능을 직접 수행한다.

동일 콘텐츠에 대해 사용자용 표시 구현과 별도의 관리자용 관리 구현을 중복해서 만드는 **중복 관리자 UI**는 원칙적으로 금지한다. 관리자 권한은 사용자 화면과 합쳐지지만 권한 자체는 합쳐지지 않는다. 일반 방문자에게 관리 컨트롤을 렌더링하지 않으며, 모든 변경 권한은 서버 측 역할·멤버십·capability 검사로 다시 확인한다.

별도 관리자 화면은 시스템 설정, 보안, 인증·권한, 역할관리, 감사, 통합 제어, 데이터 복구, 사이트 간 플랫폼 운영처럼 사용자 화면에 섞는 것이 부적절한 기능에 한해서 유지한다.

전환은 단계적으로 수행한다. 첫 실증 기준은 `seonammedi`이며, 사용자 화면 인라인 관리가 자동화 테스트와 운영 검증을 통과한 기능부터 기존 중복 관리자 UI를 제거한다. 안전한 전환 전까지는 기존 관리자 경로를 복구 가능한 fallback으로 유지한다.

공통 브라우저 런타임은 `shell/public-surface-admin.js`이다. 이 런타임은 권한을 추론하지 않고 각 서비스의 서버가 반환한 permission/capability만 사용해 인라인 버튼과 같은 출처의 관리자 편집 패널을 표시한다. 인증 토큰은 저장하거나 DOM에 노출하지 않으며, 인증 확인과 관리자 대상 경로는 same-origin으로 제한한다.

Desktop administrative surfaces keep primary navigation non-scrolling and use the central workspace as the page-level vertical scroll owner. Mobile may reposition the same navigation while preserving meaning and accessible targets.

The machine-readable source of truth is `config/ui-surface-policy.js`; automated checks must verify runtime surface markers, authority separation, PUBLIC-SURFACE-ADMIN-001, and the staged rollout evidence. All implementation branches remain subject to the EKODI AI orchestration gate and protected-branch workflow.

Canonical surface IDs: `platform-public`, `user-public`, `member-workspace`, `tenant-admin`, `platform-admin`, `service-admin`.
