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
- `guest_hidden` — 비회원 노출 OFF; discovery is hidden but existing members retain access.
- `member_forced_off` — 회원 이용 강제 OFF; discovery and existing-member access are disabled.

The default safe behavior when merely hiding a service is to preserve the rights and access of already entitled users/workspaces.

## Invariant

Customer workspace identifiers must never be added to the provider `SERVICE_CATALOG`. Add or manage them in the customer tenant/workspace directory and connect services by entitlement instead.
