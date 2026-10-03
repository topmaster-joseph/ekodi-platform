-- EKODI anonymous SECURITY DEFINER review annotation.
-- The endpoint returns only public registration state for a public activity.

comment on function public.activity_public_registration_status(text,text) is
  'Intentional public read RPC. Returns only public activity registration state and archive timing; no participant or contact data is projected.';
