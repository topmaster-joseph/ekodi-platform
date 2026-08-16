-- Bridge durable strategy outputs into the EKODI AI Context Hub.
-- This migration is additive and does not modify user/customer/application data.

create or replace function public.bridge_ai_report_to_shared_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  context_kind text;
begin
  context_kind := case
    when new.report_type = 'DECISION' then 'decision'
    else 'report'
  end;

  insert into public.ai_shared_context (
    context_type,
    visibility,
    sensitivity,
    source_agent,
    owner_agent,
    subject_type,
    subject_key,
    title,
    summary,
    payload,
    related_services,
    related_agents,
    confidence,
    status
  ) values (
    context_kind,
    'ecosystem',
    'internal',
    'Chief AI',
    case when new.decision_required then 'Representative' else 'Chief AI' end,
    'ai_report',
    new.id::text,
    new.title,
    coalesce(new.summary, new.title),
    jsonb_build_object(
      'report_id', new.id,
      'report_type', new.report_type,
      'report_status', new.status,
      'decision_required', new.decision_required,
      'source', new.source,
      'thread_id', new.thread_id,
      'message_id', new.message_id
    ),
    coalesce(new.related_services, '{}'::text[]),
    case when new.decision_required then array['Chief AI','Representative']::text[] else array['Chief AI']::text[] end,
    1.000,
    case when new.status in ('resolved','closed') then 'resolved' else 'active' end
  );

  insert into public.ai_collaboration_events (
    event_type,
    source_agent,
    target_agents,
    sensitivity,
    summary,
    payload,
    related_services
  ) values (
    case when new.decision_required then 'escalated' else 'reported' end,
    'Chief AI',
    case when new.decision_required then array['Representative']::text[] else '{}'::text[] end,
    'internal',
    new.title,
    jsonb_build_object('report_id', new.id, 'report_type', new.report_type),
    coalesce(new.related_services, '{}'::text[])
  );

  return new;
end;
$$;

drop trigger if exists trg_ai_report_shared_context on public.ai_reports;
create trigger trg_ai_report_shared_context
after insert on public.ai_reports
for each row execute function public.bridge_ai_report_to_shared_context();

revoke all on function public.bridge_ai_report_to_shared_context() from public, anon, authenticated;
grant execute on function public.bridge_ai_report_to_shared_context() to service_role;

comment on function public.bridge_ai_report_to_shared_context() is 'Publishes AI REPORT outcomes into the shared Chief AI/specialist context stream.';
