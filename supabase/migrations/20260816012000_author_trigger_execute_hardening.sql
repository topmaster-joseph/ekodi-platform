-- Trigger functions are internal database machinery and must not be callable through PostgREST RPC.

revoke all on function public.author_status_guard() from public, anon, authenticated;
revoke all on function public.author_chief_milestone() from public, anon, authenticated;
revoke all on function public.author_prepare_publication_package() from public, anon, authenticated;
revoke all on function public.author_revoke_approval_on_revision() from public, anon, authenticated;

comment on function public.author_status_guard() is 'Internal Author AI status transition trigger. RPC execution revoked.';
comment on function public.author_chief_milestone() is 'Internal Chief AI milestone trigger. RPC execution revoked; stores structured readiness only.';
comment on function public.author_prepare_publication_package() is 'Internal Author AI publication snapshot trigger. RPC execution revoked.';
comment on function public.author_revoke_approval_on_revision() is 'Internal Author AI approval revocation trigger. RPC execution revoked.';
