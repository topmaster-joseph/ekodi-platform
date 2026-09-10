# Reading Service Operator Decision Proposal

Status: proposed for guarded implementation
Date: 2026-09-10

## Decision
External-facing EKODI services are operated through the administrator surface of the service/site that provides them. The EKODI Platform Super Administrator centrally governs only EKODI Core, internal/common control services, constitutional policy, cross-service security, and platform-wide guardrails.

The Reading & Dialogue capability will be provided externally by EKODI Community, not directly by EKODI Church, EKODIBIZ, CGMA, or another tenant/workspace. EKODI Church, merchant associations, churches, institutions, projects, and other workspaces may create and operate their own reading circles using the shared capability under their own workspace context.

## External product ownership
- Public provider: EKODI Community
- Public user entry: https://ekodi.kr/community/reading
- Community public label: 함께읽기
- Internal reusable capability: EKODI Reading & Dialogue Engine
- Book metadata/catalog source: EKODI Books through an explicit public/shared contract
- Group/member/recommendation ownership: EKODI Community
- Live discussion room: Community-owned feature surface, scoped per reading circle
- Workspace usage: each workspace owns its local circle configuration and moderation through that workspace/service administrator surface

## Administration principle
1. Core, internal control services, platform-wide security, routing, identity, cross-service policy and constitutional governance remain under the Platform Super Administrator.
2. Each externally provided service/site exposes and owns its operational administration under its service/site administrator surface.
3. The Platform Super Administrator may observe and intervene only through explicit platform authority and audit-safe controls; tenant-local or service-local administration is not implicitly merged with platform authority.
4. Workspace-specific reading groups are administered by the corresponding workspace/service administrators according to membership and delegated role scope.
5. No new tenant/service subdomain is created for this capability. Human-facing routing follows the canonical ekodi.kr path grammar.

## Why EKODI Community
Reading & Dialogue is fundamentally a people-group-conversation capability. Books supplies catalog identity, but does not own social participation or moderation. EKODI Church is one possible consumer/host workspace and should not become the global provider because the service must also support non-church communities, merchant associations, schools, institutions and general users without imposing a church identity on them.

## Guardrails
- Public reading pages may be viewable without sign-in where appropriate; participation, membership, saved notes and moderation require scoped identity.
- AI assists facilitation and summarization but does not become the authority of a group.
- Audio/video permissions are requested only inside explicit live-room flows.
- Cross-workspace private reading data is never shared implicitly.
- Service-local moderation and platform safety controls remain distinct.

## Rollout target
1. Register `community/reading` as the canonical public surface.
2. Add Community admin navigation for Reading & Dialogue.
3. Add reusable Reading Lens and reading-circle configuration under Community ownership.
4. Connect Books metadata through a declared contract.
5. Add live-room and post-discussion record features incrementally.
6. Verify production route, admin visibility, tenant isolation, privacy, and moderation boundaries before declaring completion.
