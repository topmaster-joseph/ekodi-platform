INSERT OR IGNORE INTO service_registry_v4
  (id, name, domain, category, organization_id, business_unit_id, criticality, monitor_enabled, note, updated_at)
VALUES
  ('auth', 'Auth API', 'api.ekodi.kr', 'core', NULL, NULL, 'critical', 0, 'Health endpoint: /health', CURRENT_TIMESTAMP),
  ('ops', 'Ops API', 'ops-api.ekodi.kr', 'core', NULL, NULL, 'critical', 0, 'Health endpoint: /health', CURRENT_TIMESTAMP);
