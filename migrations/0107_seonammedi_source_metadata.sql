ALTER TABLE seonammedi_monitor_items ADD COLUMN source_type TEXT NOT NULL DEFAULT 'news';
ALTER TABLE seonammedi_monitor_items ADD COLUMN summary_text TEXT NOT NULL DEFAULT '';
