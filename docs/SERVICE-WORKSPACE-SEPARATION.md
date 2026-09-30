# EKODI Service / Customer Workspace separation

## Canonical boundary

- **EKODIBIZ** is the service provider and legal operating subject.
- **Service** means a capability or product EKODI provides and operates.
- **User** means an individual account holder.
- **Workspace** means an independent customer context such as a business, church, institution or association.
- **Entitlement** connects a User or Workspace to the Service it is allowed to use.

A customer-created site or workspace is not converted into an EKODI Service merely because an EKODI administrator helped build or operate it.

## Control Center separation

Provider services are managed through the Service Control registry and health monitor.
Customer organizations are managed through the existing customer tenant/workspace directory and its member controls.

The customer workspaces currently represented by 청계면상인회, 자담치킨 목포대점, 피자마루 목포대점 and 요거트퍼플 목포대점 must therefore remain on the customer/workspace side of this boundary. Their existing URLs and customer data are not deleted by this separation.

## User-service classification

User-facing EKODI services have two product kinds:

1. `shared_user_service` — 사용자 공용서비스
2. `dedicated_user_service` — 사용자 전용서비스

Internal platform components such as Core, Auth, Admin and API are infrastructure and are not customer workspaces.

## Visibility and access

Visibility is not the same as service operation.

- `guest_visible` — 비회원 노출 ON; non-members can discover the service and existing members retain access.
- `guest_hidden` — 비회원 검색·목록 노출 OFF 또는 명시적 비공개 콘텐츠용. **정식 공개 사용자페이지의 루트 화면을 로그인 벽이나 권한 오류로 대체하는 용도로 사용할 수 없다.** Existing members retain access where entitled.
- `member_forced_off` — 회원 이용 강제 OFF; discovery and existing-member access are disabled.

The default safe behavior when merely hiding a service is to preserve the rights and access of already entitled users/workspaces.

## Invariant

Customer workspace identifiers must never be added to the provider `SERVICE_CATALOG`. Add or manage them in the customer tenant/workspace directory and connect services by entitlement instead.


## Public user surface default

Canonical public user pages are guest-open by default. Authentication changes the projection and capabilities, not whether the public page exists.

- Guest: safe public content and service/site guide remain readable.
- Signed-in member: public content remains and eligible personalized/free-tier capabilities are added.
- Workspace member/operator: role/capability-scoped private operations are added.
- Administrator: admin capabilities remain on the canonical `/admin` surface and never leak into the public projection.
- A protected API returning 401/403/404 does not authorize replacing the public page with an access-denied screen. The UI falls back to the safe public projection.
- Explicit private/closed surfaces require a declared private classification and still return a safe public landing/privacy notice at the canonical public root.
