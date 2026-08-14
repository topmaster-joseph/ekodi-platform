-- The CGMA service key is stable, while its tenant slug may be `cheonggye` or another
-- operational alias. Enable the association-funded Marketing Basic policy by the
-- verified site registry relationship instead of assuming a tenant slug.

update public.tenants t
   set settings = coalesce(t.settings, '{}'::jsonb)
     || jsonb_build_object(
          'marketing_ai',
          coalesce(t.settings->'marketing_ai', '{}'::jsonb)
          || jsonb_build_object('member_benefit', true, 'member_plan', 'basic')
        )
 where t.kind = 'association'
   and exists (
     select 1
       from public.site_access_registry r
      where r.tenant_id = t.id
        and r.site_key = 'cgma'
   );
