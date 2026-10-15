-- Immutable server-side invariants for EKODIBIZ quote/review state transitions.
-- Protect across concurrent API calls; a D1 batch is atomic only when a statement
-- fails *inside* the transaction, not when application logic inspects row changes later.
CREATE TRIGGER IF NOT EXISTS ai_assistance_quote_requires_approved_request
BEFORE INSERT ON ai_assistance_quotes
WHEN NOT EXISTS (
  SELECT 1 FROM ai_assistance_requests r
  WHERE r.id=NEW.request_id AND r.user_id=NEW.user_id
    AND r.state='merchant_approved'
)
BEGIN
  SELECT RAISE(ABORT,'assistance_quote_requires_approved_request');
END;

CREATE TRIGGER IF NOT EXISTS ai_assistance_ack_requires_owner_and_live_request
BEFORE UPDATE OF status ON ai_assistance_quotes
WHEN NEW.status='acknowledged' AND (
  OLD.status<>'issued' OR NEW.user_id<>OLD.user_id OR
  NEW.acknowledged_by IS NULL OR NEW.acknowledged_by<>OLD.user_id OR
  NEW.digest<>OLD.digest OR NEW.total_krw<>OLD.total_krw OR
  unixepoch(OLD.expires_at)<=unixepoch('now') OR
  NOT EXISTS (
    SELECT 1 FROM ai_assistance_requests r
    WHERE r.id=NEW.request_id AND r.user_id=NEW.user_id
      AND r.state='merchant_approved'
  )
)
BEGIN
  SELECT RAISE(ABORT,'assistance_quote_acknowledgment_not_allowed');
END;

CREATE TRIGGER IF NOT EXISTS ai_assistance_contract_pending_requires_review
BEFORE UPDATE OF state ON ai_assistance_requests
WHEN NEW.state='contract_pending' AND (
  OLD.state<>'merchant_approved' OR
  NOT EXISTS (
    SELECT 1 FROM ai_assistance_quotes q
    WHERE q.request_id=NEW.id AND q.user_id=NEW.user_id
      AND q.status='acknowledged' AND q.acknowledged_by=NEW.user_id
  )
)
BEGIN
  SELECT RAISE(ABORT,'assistance_contract_pending_requires_review');
END;

CREATE TRIGGER IF NOT EXISTS ai_assistance_audit_requires_real_quote
BEFORE INSERT ON ai_assistance_events
WHEN (NEW.kind='quote_issued' AND NOT EXISTS (
    SELECT 1 FROM ai_assistance_quotes q
    WHERE q.request_id=NEW.request_id AND q.approved_by=NEW.actor_id
  )) OR (NEW.kind='quote_acknowledged' AND NOT EXISTS (
    SELECT 1 FROM ai_assistance_quotes q
    WHERE q.request_id=NEW.request_id AND q.status='acknowledged'
      AND q.acknowledged_by=NEW.actor_id
  ))
BEGIN
  SELECT RAISE(ABORT,'assistance_event_requires_confirmed_quote');
END;
