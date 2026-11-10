-- #7778 / #6739. Rewards V2 requires independent, authoritative evidence.
-- Guard the award activation surface itself; a browser heartbeat/foreground
-- signal and a devotional self-report are never creditable evidence.
-- Deliberately fail migration if an older enabled policy exists: do not
-- silently change balances, past awards or an owner's financial configuration.
DO $nonverified_preflight$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.ekodi_point_rules
    WHERE rule_id='active' AND enabled
  ) OR EXISTS(
    SELECT 1 FROM public.ekodi_point_evidence_adapters
    WHERE adapter='devotion_self_report' AND enabled
  ) THEN
    RAISE EXCEPTION 'POINTS_NONVERIFIED_REWARD_POLICY_REVIEW_REQUIRED';
  END IF;
END $nonverified_preflight$;

-- The heartbeat RPC and trusted award_activity both require an enabled rule;
-- this protects even service-role direct calls, not merely client buttons.
ALTER TABLE public.ekodi_point_rules
  ADD CONSTRAINT ekodi_points_no_unverified_active_credit
  CHECK (rule_id <> 'active' OR enabled = false);

-- Never let a self-reported religious activity become an economic reward.
-- The member can still record a personal devotion elsewhere without a
-- points value. Verified nonreligious content/education adapters are intact.
ALTER TABLE public.ekodi_point_evidence_adapters
  ADD CONSTRAINT ekodi_points_no_devotion_self_report_credit
  CHECK (adapter <> 'devotion_self_report' OR enabled = false);
