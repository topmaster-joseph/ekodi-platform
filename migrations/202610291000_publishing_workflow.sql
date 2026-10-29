-- PUBLISH-PIPELINE-001 (migration candidate only, not applied to production)
-- Own D1 binding PUBLISH_DB (independent from BOOKS.DB / payment data).
CREATE TABLE IF NOT EXISTS publishing_workflow_projects (
 id TEXT PRIMARY KEY, author_user_id TEXT NOT NULL, title TEXT NOT NULL, field_id TEXT NOT NULL,
 collection_id TEXT NOT NULL DEFAULT 'human',
 stage TEXT NOT NULL DEFAULT 'planning',
 manuscript_digest TEXT, release_digest TEXT, edition_id TEXT NOT NULL,
 release_candidate_json TEXT NOT NULL DEFAULT '{}',
 author_approval_json TEXT, publisher_approval_json TEXT, channels_json TEXT,
 scheduled_at TEXT, ready_at TEXT, released_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1, last_event_id TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_author
 ON publishing_workflow_projects(author_user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_schedule
 ON publishing_workflow_projects(stage, scheduled_at);
CREATE TABLE IF NOT EXISTS publishing_workflow_roles (
 user_id TEXT PRIMARY KEY,
 role TEXT NOT NULL CHECK(role IN ('editor','publisher','admin')),
 granted_by TEXT NOT NULL, granted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publishing_workflow_audit (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, actor_user_id TEXT NOT NULL,
 action TEXT NOT NULL, from_stage TEXT, to_stage TEXT,
 revision INTEGER NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_audit_project
 ON publishing_workflow_audit(project_id,created_at);
CREATE TABLE IF NOT EXISTS publishing_workflow_ai_jobs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, author_user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('research','outline','draft','revision','fact_check','literary_edit','accessibility')),
 provider TEXT NOT NULL DEFAULT 'core', spend_krw INTEGER NOT NULL DEFAULT 0 CHECK(spend_krw=0),
 source_revision INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES publishing_workflow_projects(id)
);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_jobs_project
 ON publishing_workflow_ai_jobs(project_id,created_at);
-- Deliberately no trigger setting a book 'live', no job that charges a paid LLM.


CREATE TABLE IF NOT EXISTS publishing_workflow_handoff_outbox (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, edition_id TEXT NOT NULL,
 release_digest TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
 payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','dispatched','confirmed','blocked')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_handoff
 ON publishing_workflow_handoff_outbox(status,created_at);
-- The outbox carries proposed, never pre-authorized sale activations.


-- Protected private attestations: the public UI may READ their boolean result, but
-- must not create/update these tables. These are not client-input checkboxes.
CREATE TABLE IF NOT EXISTS publishing_workflow_release_contracts (
 project_id TEXT PRIMARY KEY, author_user_id TEXT NOT NULL, edition_digest TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','signed','revoked')),
 author_signed_at TEXT, publisher_signed_at TEXT,
 royalty_terms_accepted INTEGER NOT NULL DEFAULT 0 CHECK(royalty_terms_accepted IN (0,1)),
 commission_terms_accepted INTEGER NOT NULL DEFAULT 0 CHECK(commission_terms_accepted IN (0,1)),
 distribution_license_accepted INTEGER NOT NULL DEFAULT 0 CHECK(distribution_license_accepted IN (0,1)),
 sealed_contract_sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES publishing_workflow_projects(id)
);
CREATE TABLE IF NOT EXISTS publishing_workflow_audio_release_qa (
 project_id TEXT PRIMARY KEY, edition_digest TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('preparing','under_review','approved','revoked')),
 master_sha256 TEXT NOT NULL, voice_license_verified INTEGER NOT NULL DEFAULT 0 CHECK(voice_license_verified IN (0,1)),
 dialogue_qa_passed INTEGER NOT NULL DEFAULT 0 CHECK(dialogue_qa_passed IN (0,1)),
 full_track_qa_passed INTEGER NOT NULL DEFAULT 0 CHECK(full_track_qa_passed IN (0,1)),
 buyer_access_verified INTEGER NOT NULL DEFAULT 0 CHECK(buyer_access_verified IN (0,1)),
 refund_revoke_verified INTEGER NOT NULL DEFAULT 0 CHECK(refund_revoke_verified IN (0,1)),
 bonus_price_krw INTEGER NOT NULL DEFAULT 0 CHECK(bonus_price_krw=0),
 verified_by TEXT, verified_at TEXT,
 FOREIGN KEY(project_id) REFERENCES publishing_workflow_projects(id)
);
-- Important: neither table has a public write API; an auditor's statement must
-- be reconciled against actual signed contracts/audio assets before sale launch.
