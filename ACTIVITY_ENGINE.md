# EKODI Activity · Person Participation Engine

## Canonical model
- Person source of truth: `public.people`
- Private contact identifiers: `public.person_contacts`
- Activity source of truth: `public.activities`
- Participation source of truth: `public.activity_participations`
- Explicit membership/relationship source: `public.person_workspace_relationships`
- Audit: `public.activity_participation_audit`

Participation never creates membership, church membership, donor, volunteer, partner, or staff relationships.

## Tenant ownership
Every activity belongs to one immutable `tenants.id`. EKODI Mission is registered as the `ekodimission` tenant and uses tenant-local authorization resolved by `current_site_activity_contexts()`.

## Channels
Website, QR, Google Form adapters, administrator entry, imports, and APIs converge on `activity_submit_participation`. Provider forms are adapters only; they are not sources of truth.

## Duplicate handling
Phone and email contact identifiers are normalized in the private contact ledger. Existing matching contacts resolve to the same Person. A phone/email pair that points to two different People fails closed with `CONTACT_IDENTITY_CONFLICT`; the system does not silently merge identities.

## Lifecycle
Participation statuses:
`applied → waitlist/confirmed → attended/no_show`, with `cancelled` available at any pre/post-event point.

Tenant administrators can manage status, check-in, participant role, party size, companions, support notes, and follow-up state through authenticated RPCs. Every admin mutation is audited.

## Compatibility
The existing `mission_events`, `mission_event_applications`, and `mission_submit_event_application` interfaces remain available. Existing Mission applications are backfilled into the canonical ledger, and future first-party Mission submissions dual-write the legacy compatibility projection from the canonical Activity+Person write.

## Privacy and authority
Direct reads/writes to private contact, participation, relationship, and audit tables are revoked from browser roles. Tenant administrators access participant data through authenticated, tenant-scoped SECURITY DEFINER RPCs. Platform-global authority does not automatically become tenant-local participant-data access; an explicit tenant-local grant is required.
