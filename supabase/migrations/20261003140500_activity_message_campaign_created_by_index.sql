-- EKODI production traffic hardening.
-- Cover the activity_message_campaigns.created_by foreign key so user deletion / FK checks
-- do not require a sequential scan as activity messaging volume grows.

create index if not exists activity_message_campaigns_created_by_idx
  on public.activity_message_campaigns(created_by);
