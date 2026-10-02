-- Optional administrator-selected safe preview URL for provider channels.
-- Automatic provider discovery remains the default; this value is used only as an explicit safe fallback.
ALTER TABLE seonammedi_channels ADD COLUMN preview_url TEXT NOT NULL DEFAULT '';
