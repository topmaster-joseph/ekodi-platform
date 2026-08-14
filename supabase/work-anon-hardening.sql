-- Supabase may auto-grant EXECUTE on newly created public functions to anon.
-- Keep all EKODI Work SECURITY DEFINER functions unavailable before sign-in.
revoke execute on function public.work_owns_organization(uuid) from anon;
revoke execute on function public.work_owns_job(uuid) from anon;
revoke execute on function public.work_get_my_organization() from anon;
revoke execute on function public.work_employer_applications() from anon;
revoke execute on function public.work_update_application_status(uuid,text) from anon;
