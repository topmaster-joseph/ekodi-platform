-- Privacy backstop: once a consultation is revoked, D1 itself removes identifying fields.
-- The row remains only as a non-identifying tombstone until the normal retention cleanup.

CREATE TRIGGER IF NOT EXISTS consultation_revoke_minimize
AFTER UPDATE OF status ON consultation_requests
WHEN NEW.status = 'revoked'
BEGIN
  UPDATE consultation_requests
  SET
    user_id = NULL,
    contact_name = '',
    contact_ciphertext = '',
    contact_hint = '',
    preferred_time = '',
    ai_summary = '',
    transcript_ciphertext = NULL,
    transcript_shared = 0,
    access_token_hash = ''
  WHERE id = NEW.id;
END;
