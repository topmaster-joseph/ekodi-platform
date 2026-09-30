-- Switch EKODI Google bootstrap super administrator to the personal Google account.
-- Insert/activate the new super admin first so the platform never has zero active super admins.
INSERT INTO admin_google_accounts
  (email, google_sub, required_hd, display_name, role, status, last_login_at, created_at, updated_at)
SELECT
  'topmaster.joseph@gmail.com',
  NULL,
  NULL,
  '',
  'super_admin',
  'active',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM admin_google_accounts WHERE email = 'topmaster.joseph@gmail.com'
);

UPDATE admin_google_accounts
SET role = 'super_admin',
    status = 'active',
    required_hd = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'topmaster.joseph@gmail.com';

UPDATE admin_google_accounts
SET status = 'disabled',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'joseph@ekodibiz.kr';
