-- One meeting registry, two independent operational owners.
-- Historical Saturday records stay intact; no DELETE or reclassification of attendance.
ALTER TABLE public.church_worship_materials ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE action_name text;
BEGIN
  FOREACH action_name IN ARRAY ARRAY['read all','insert','update','delete'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.church_worship_materials', 'church tenant admin can ' || action_name || ' worship');
  END LOOP;
END $$;
DROP POLICY IF EXISTS "published worship visible to signed-in" ON public.church_worship_materials;
DROP POLICY IF EXISTS "mission tenant admin can read saturday worship" ON public.church_worship_materials;
DROP POLICY IF EXISTS "mission tenant admin can insert saturday worship" ON public.church_worship_materials;
DROP POLICY IF EXISTS "mission tenant admin can update saturday worship" ON public.church_worship_materials;
DROP POLICY IF EXISTS "mission tenant admin can delete saturday worship" ON public.church_worship_materials;

CREATE POLICY "published worship visible to signed-in"
ON public.church_worship_materials FOR SELECT TO authenticated
USING (is_published = true);

CREATE POLICY "church tenant admin can read all worship"
ON public.church_worship_materials FOR SELECT TO authenticated
USING (service_type='sunday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='church' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "church tenant admin can insert worship"
ON public.church_worship_materials FOR INSERT TO authenticated
WITH CHECK (service_type='sunday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='church' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "church tenant admin can update worship"
ON public.church_worship_materials FOR UPDATE TO authenticated
USING (service_type='sunday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='church' AND r.status='active' AND r.role::text='tenant_admin'
))
WITH CHECK (service_type='sunday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='church' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "church tenant admin can delete worship"
ON public.church_worship_materials FOR DELETE TO authenticated
USING (service_type='sunday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='church' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "mission tenant admin can read saturday worship"
ON public.church_worship_materials FOR SELECT TO authenticated
USING (service_type='saturday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='mission' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "mission tenant admin can insert saturday worship"
ON public.church_worship_materials FOR INSERT TO authenticated
WITH CHECK (service_type='saturday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='mission' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "mission tenant admin can update saturday worship"
ON public.church_worship_materials FOR UPDATE TO authenticated
USING (service_type='saturday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='mission' AND r.status='active' AND r.role::text='tenant_admin'
))
WITH CHECK (service_type='saturday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='mission' AND r.status='active' AND r.role::text='tenant_admin'
));
CREATE POLICY "mission tenant admin can delete saturday worship"
ON public.church_worship_materials FOR DELETE TO authenticated
USING (service_type='saturday' AND EXISTS (
 SELECT 1 FROM public.site_access_registry r
 WHERE lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
 AND r.site_key='mission' AND r.status='active' AND r.role::text='tenant_admin'
));
