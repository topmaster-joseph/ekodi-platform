ALTER TABLE affiliate_partner_report_control ADD COLUMN catalog_force_requested_at TEXT;
ALTER TABLE affiliate_partner_report_control ADD COLUMN catalog_force_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliate_partner_report_control ADD COLUMN catalog_force_consumed_at TEXT;