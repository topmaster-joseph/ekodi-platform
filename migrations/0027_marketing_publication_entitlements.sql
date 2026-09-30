-- Server-side entitlement gates for Marketing publication jobs.
-- UI permissions are only convenience; these triggers are the authoritative bypass-resistant gate.
-- Store jobs inherit the Marketing subscription of their owning tenant because service_subscriptions
-- intentionally stores only person/tenant subjects.
-- Repeating child jobs are marked failed instead of aborting their insert so a downgrade never turns
-- an already-published parent job into a false failure.

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_insert_immediate
BEFORE INSERT ON marketing_publication_jobs
WHEN NEW.schedule_kind='immediate' AND NOT EXISTS (
  SELECT 1 FROM service_subscriptions s
  WHERE s.site='marketing' AND s.status='active'
    AND s.plan_id IN ('flex','plus','pro','auto','enterprise')
    AND (
      (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
      OR
      (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
    )
)
BEGIN
  SELECT RAISE(ABORT,'MARKETING_PLAN_IMMEDIATE_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_insert_scheduled
BEFORE INSERT ON marketing_publication_jobs
WHEN NEW.schedule_kind='scheduled' AND NOT EXISTS (
  SELECT 1 FROM service_subscriptions s
  WHERE s.site='marketing' AND s.status='active'
    AND s.plan_id IN ('plus','pro','auto','enterprise')
    AND (
      (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
      OR
      (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
    )
)
BEGIN
  SELECT RAISE(ABORT,'MARKETING_PLAN_SCHEDULE_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_insert_optimal
BEFORE INSERT ON marketing_publication_jobs
WHEN NEW.schedule_kind='optimal' AND NOT EXISTS (
  SELECT 1 FROM service_subscriptions s
  WHERE s.site='marketing' AND s.status='active'
    AND s.plan_id IN ('auto','enterprise')
    AND (
      (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
      OR
      (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
    )
)
BEGIN
  SELECT RAISE(ABORT,'MARKETING_PLAN_AUTO_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_insert_ai_nonrepeat
BEFORE INSERT ON marketing_publication_jobs
WHEN NEW.requested_by='ai' AND NEW.schedule_kind!='repeating' AND NOT EXISTS (
  SELECT 1 FROM service_subscriptions s
  WHERE s.site='marketing' AND s.status='active'
    AND s.plan_id IN ('auto','enterprise')
    AND (
      (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
      OR
      (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
    )
)
BEGIN
  SELECT RAISE(ABORT,'MARKETING_PLAN_AI_AUTOMATION_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_insert_repeating
AFTER INSERT ON marketing_publication_jobs
WHEN NEW.schedule_kind='repeating' AND (
  NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active'
      AND s.plan_id IN ('pro','auto','enterprise')
      AND (
        (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR
        (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
      )
  )
  OR
  (NEW.requested_by='ai' AND NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active'
      AND s.plan_id IN ('auto','enterprise')
      AND (
        (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR
        (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
      )
  ))
)
BEGIN
  UPDATE marketing_publication_jobs
  SET status='failed',
      last_error=CASE
        WHEN NEW.requested_by='ai' THEN 'MARKETING_PLAN_AI_AUTOMATION_REQUIRED'
        ELSE 'MARKETING_PLAN_REPEAT_REQUIRED'
      END,
      updated_at=CURRENT_TIMESTAMP
  WHERE id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_execute
BEFORE UPDATE OF status ON marketing_publication_jobs
WHEN NEW.status='publishing' AND (
  (NEW.schedule_kind='immediate' AND NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active' AND s.plan_id IN ('flex','plus','pro','auto','enterprise')
      AND ((NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1)))
  ))
  OR
  (NEW.schedule_kind='scheduled' AND NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active' AND s.plan_id IN ('plus','pro','auto','enterprise')
      AND ((NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1)))
  ))
  OR
  (NEW.schedule_kind='repeating' AND NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active' AND s.plan_id IN ('pro','auto','enterprise')
      AND ((NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1)))
  ))
  OR
  (NEW.schedule_kind='optimal' AND NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active' AND s.plan_id IN ('auto','enterprise')
      AND ((NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1)))
  ))
  OR
  (NEW.requested_by='ai' AND NOT EXISTS (
    SELECT 1 FROM service_subscriptions s
    WHERE s.site='marketing' AND s.status='active' AND s.plan_id IN ('auto','enterprise')
      AND ((NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
        OR (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1)))
  ))
)
BEGIN
  UPDATE marketing_publication_jobs
  SET status='failed',
      next_attempt_at=NULL,
      last_error=CASE
        WHEN NEW.requested_by='ai' THEN 'MARKETING_PLAN_AI_AUTOMATION_REQUIRED'
        WHEN NEW.schedule_kind='immediate' THEN 'MARKETING_PLAN_IMMEDIATE_REQUIRED'
        WHEN NEW.schedule_kind='scheduled' THEN 'MARKETING_PLAN_SCHEDULE_REQUIRED'
        WHEN NEW.schedule_kind='repeating' THEN 'MARKETING_PLAN_REPEAT_REQUIRED'
        ELSE 'MARKETING_PLAN_AUTO_REQUIRED'
      END,
      updated_at=CURRENT_TIMESTAMP
  WHERE id=OLD.id;
  SELECT RAISE(IGNORE);
END;
