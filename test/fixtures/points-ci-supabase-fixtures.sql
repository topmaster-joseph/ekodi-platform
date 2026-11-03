-- Ephemeral CI Supabase only. Loaded INSIDE each smoke's BEGIN ... ROLLBACK
-- by scripts/run-points-sql-smokes.mjs --existing-schema. Never persisted.
insert into public.tenants(slug,name)
  select 'points-smoke-'||replace(gen_random_uuid()::text,'-',''),'Points smoke tenant'
  from generate_series(1,2);
insert into auth.users(id,aud,role,email,created_at,updated_at,email_confirmed_at)
  select gen_random_uuid(),'authenticated','authenticated',
         'points-smoke-'||g||'@example.invalid',
         now()-interval '60 days',now()-interval '60 days',now()-interval '60 days'
  from generate_series(1,2) g;
