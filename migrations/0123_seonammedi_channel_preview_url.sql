-- Schema marker for deterministic SeonamMedi channel previews.
-- preview_url is added idempotently by ensurePublicContentSchema()/addColumnIfMissing
-- before public channel reads, avoiding duplicate-column failures across reused staging D1.
SELECT 1;
