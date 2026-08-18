-- Server-side entitlement gates for Marketing publication jobs.
-- The UI also hides unavailable actions, but these triggers are the authoritative bypass-resistant gate.
-- Store-scoped jobs inherit the Marketing subscription of their owning tenant because
-- service_subscriptions intentionally stores only person/tenant subjects.

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_insert
BEFORE INSERT ON marketing_publication_jobs
BEGIN
  SELECT CASE
    WHEN NEW.schedule_kind = 'immediate' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('flex','plus','pro','auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_IMMEDIATE_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.schedule_kind = 'scheduled' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('plus','pro','auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_SCHEDULE_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.schedule_kind = 'repeating' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('pro','auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_REPEAT_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.schedule_kind = 'optimal' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_AUTO_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.requested_by = 'ai' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_AI_AUTOMATION_REQUIRED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_marketing_publication_plan_execute
BEFORE UPDATE OF status ON marketing_publication_jobs
WHEN NEW.status='publishing'
BEGIN
  SELECT CASE
    WHEN NEW.schedule_kind = 'immediate' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('flex','plus','pro','auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_IMMEDIATE_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.schedule_kind = 'scheduled' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('plus','pro','auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_SCHEDULE_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.schedule_kind = 'repeating' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('pro','auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_REPEAT_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.schedule_kind = 'optimal' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_AUTO_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.requested_by = 'ai' AND NOT EXISTS (
      SELECT 1 FROM service_subscriptions s
      WHERE s.site='marketing' AND s.status='active'
        AND s.plan_id IN ('auto','enterprise')
        AND (
          (NEW.subject_type IN ('person','tenant') AND s.subject_type=NEW.subject_type AND s.subject_key=NEW.subject_key)
          OR
          (NEW.subject_type='store' AND s.subject_type='tenant' AND s.subject_key=(SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=NEW.subject_key LIMIT 1))
        )
    ) THEN RAISE(ABORT,'MARKETING_PLAN_AI_AUTOMATION_REQUIRED')
  END;
END;
