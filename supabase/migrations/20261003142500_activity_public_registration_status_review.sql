-- EKODI anonymous SECURITY DEFINER review annotations.
-- Each function below is intentionally reachable from the anonymous Data API role.
-- Comments document the reviewed public contract; CI rejects any future anonymous
-- SECURITY DEFINER function that lacks an explicit review comment.

comment on function public.activity_collab_public_snapshot(text,text) is
  'Intentional public read RPC for published activity plan content only.';
comment on function public.activity_collab_publish(text,text,integer) is
  'Intentional owner-token publish RPC. Owner token is separate from shared editor token.';
comment on function public.activity_collab_share_snapshot(text) is
  'Intentional token-gated public collaboration RPC. Returns activity plan content only, never participant or contact data.';
comment on function public.activity_collab_update(text,text,jsonb,integer) is
  'Intentional token-gated public collaboration RPC with optimistic revision checks. No participant data access.';
comment on function public.activity_public_archive_snapshot(text,text) is
  'Intentional public archive read RPC. Available only for public activities after the activity has ended.';
comment on function public.activity_public_registration_status(text,text) is
  'Intentional public read RPC. Returns only public activity registration state and archive timing; no participant or contact data is projected.';
comment on function public.activity_public_share_snapshot(text) is
  'Intentional high-entropy expiring-token projection. Returns only the approved minimal participant share fields.';
comment on function public.activity_submit_participation(text,text,text,text,text,integer,text,text,text,text,boolean,text,text,jsonb) is
  'Intentional public registration RPC. Validates published activity, bounded inputs and privacy consent before writing.';
comment on function public.current_ekodi_mcp_identity() is
  'Intentional OAuth MCP exception. Anonymous DB role execution still requires authenticated EKODI MCP JWT client and audience claims.';
comment on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) is
  'Intentional public mission application RPC. Honeypot and privacy-consent checks precede the canonical activity submission.';
comment on function public.person_digital_card(text) is
  'Intentional anonymous projection. Returns only explicitly public digital-card fields for a published person handle.';
comment on function public.store_public_storefront(text) is
  'Intentional public storefront projection limited to public presentation and ordering metadata.';
comment on function public.store_user_site_public_profile(text) is
  'Intentional public user-site profile projection limited to public presentation data.';
comment on function public.store_user_site_public_snapshot(text) is
  'Intentional public user-site snapshot limited to public presentation and menu data.';
comment on function public.submit_person_contact_exchange(text,text,text,text,text,text,text,boolean,text) is
  'Intentional anonymous contact-exchange endpoint. Requires privacy consent, validated contact input, throttling and an enabled public receiver.';

-- Note: production-only RPCs person_identity_share(...) and submit_person_contact_exchange_v2(...)
-- are already reviewed and commented in production, but are intentionally excluded here until their
-- canonical schema migrations are imported into the repository baseline.
