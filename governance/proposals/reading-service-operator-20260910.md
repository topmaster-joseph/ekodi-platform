# Reading Service Operator Decision

Status: owner-approved; guarded rollout
Date: 2026-09-10

## Decision
External-facing EKODI services are operated through the administrator surface of the service/site that provides them. The EKODI Platform Super Administrator centrally governs EKODI Core, internal control services, constitutional policy, cross-service security, observability and platform-wide guardrails.

The Reading & Dialogue capability is externally provided by Community, not directly by Church, EKODIBIZ, CGMA or another tenant/workspace. Church, merchant associations, schools, institutions, businesses, projects and personal workspaces may create and operate their own reading circles using the shared capability under their own workspace context.

## External product ownership
- Public provider: Community
- Public user entry: https://ekodi.kr/community/reading
- Public service label: 함께읽기
- Internal reusable capability: EKODI Reading & Dialogue Engine
- Book metadata/catalog source: 에코디서점 through an explicit public/shared contract
- Group/member/recommendation ownership: Community
- Live discussion room: Community-owned feature surface, scoped per reading circle
- Workspace usage: each workspace owns its local circle configuration and moderation through that workspace/service administrator surface

## Administration principle
1. Core, internal control services, platform-wide security, routing, identity, cross-service policy and constitutional governance remain under the Platform Super Administrator.
2. Each externally provided service/site uses its service/site administrator surface as the operational source of truth.
3. The Platform Super Administrator may observe, audit and explicitly intervene through platform authority, but tenant-local or service-local authority is never implicitly inherited.
4. Workspace-specific reading groups are administered by the corresponding workspace/service administrators according to membership, role and delegated capability scope.
5. No new tenant/service subdomain is created for this capability. Human-facing routing follows the canonical ekodi.kr path grammar.

## Why Community
Reading & Dialogue is fundamentally a people-group-conversation capability. Books supplies catalog identity, but does not own social participation or moderation. Church is one possible consumer/host workspace and should not become the global provider because the service must also support non-church communities, merchant associations, schools, institutions and general users without imposing a church identity on them.

## Guardrails
- Public reading pages may be viewable without sign-in where appropriate; participation, membership, saved notes and moderation require scoped identity.
- AI assists facilitation and summarization but does not become the authority of a group.
- Audio/video permissions are requested only inside explicit live-room flows.
- Cross-workspace private reading data is never shared implicitly.
- Service-local moderation and platform safety controls remain distinct.

## Rollout boundary for this decision
This change registers the provider, service ownership and administrator responsibility model and projects it into the Community administrator surface. Reading-room product features, Books catalog integration and live discussion execution remain separate incremental capability work and must follow the same guarded release path.
