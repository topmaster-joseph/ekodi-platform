-- Add an optional administrator-selected channel preview URL.
-- This keeps same-page channel previews deterministic when a provider does not expose
-- enough public metadata for automatic latest-content discovery.
ALTER TABLE seonammedi_channels ADD COLUMN preview_url TEXT NOT NULL DEFAULT '';
