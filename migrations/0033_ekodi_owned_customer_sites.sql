-- EKODI-owned operating organizations use the same customer-tenant contract
-- as external customers. Core/shared services are intentionally not seeded here.
INSERT OR IGNORE INTO customer_tenants (slug, name, domain, status, created_at) VALUES
  ('ekodi-church', '에코디교회', 'ekodi.kr/ekodichurch', 'active', datetime('now')),
  ('ekodi-biz', '에코디비즈', 'ekodi.kr/ekodibiz', 'active', datetime('now')),
  ('ekodi-lab', '에코디연구소', 'ekodi.kr/ekodilab', 'active', datetime('now')),
  ('ekodi-trade', 'EKODI Global Trading', 'ekodi.kr/ekodibiz/trade', 'active', datetime('now')),
  ('ekodi-cafe', '에코디 카페', 'ekodi.kr/cafe', 'active', datetime('now'));
