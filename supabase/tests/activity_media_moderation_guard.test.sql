-- EKODI Mission moderation function-body contract check in disposable local Supabase CI.
-- All checks are read-only; no member, upload, event or payment record is modified.
begin;
select plan(6);

select ok(
  to_regprocedure('public.activity_public_submit_media_link(text,text,text,text,text,text,text,text)') is not null,
  'mission link RPC exists'
);
select ok(
  to_regprocedure('public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text)') is not null,
  'mission photo reservation RPC exists'
);
select ok(
  to_regprocedure('public.activity_public_finalize_media_upload(text,text,uuid,text,text)') is not null,
  'mission photo finalization RPC exists'
);
select ok(
  position('media_moderated' in pg_get_functiondef('public.activity_public_submit_media_link(text,text,text,text,text,text,text,text)'::regprocedure)) > 0,
  'hidden canonical links reject anonymous resubmission'
);
select ok(
  position('media_moderated' in pg_get_functiondef('public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text)'::regprocedure)) > 0,
  'hidden photo fingerprints reject re-reservation'
);
select ok(
  position('and hidden_at is null' in lower(pg_get_functiondef('public.activity_public_finalize_media_upload(text,text,uuid,text,text)'::regprocedure))) > 0,
  'moderated photo finalization cannot disclose hidden item'
);
select * from finish();
rollback;
