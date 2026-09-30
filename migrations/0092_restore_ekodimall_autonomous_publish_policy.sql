-- Restore the canonical EKODI Mall growth publication contract after production drift.
-- Only the active internal auto-plan Mall is repaired; Biz and Trade remain review-only.
UPDATE marketing_publish_policies
SET mode = 'autonomous',
    max_daily_posts = 3,
    updated_at = CURRENT_TIMESTAMP
WHERE subject_type = 'tenant'
  AND subject_key = 'ekodimall'
  AND EXISTS (
    SELECT 1
    FROM service_subscriptions
    WHERE subject_type = 'tenant'
      AND subject_key = 'ekodimall'
      AND site = 'marketing'
      AND plan_id = 'auto'
      AND status = 'active'
  );
