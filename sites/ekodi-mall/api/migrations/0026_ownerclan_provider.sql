-- EKODI-MALL-OWNERCLAN-001: 2순위 위탁 공급사 오너클랜(셀러 GraphQL API) 등록. 자동발주는 스키마 확인 후 별도 단계.
INSERT OR IGNORE INTO sourcing_providers
  (id,display_name,provider_type,integration_mode,connection_status,catalog_policy,order_mode,auto_order_enabled,customer_pii_allowed,created_at,updated_at)
VALUES
  ('ownerclan-official','오너클랜 셀러 API','supplier_api','api','api_pending','reference_only','api_order',0,0,datetime('now'),datetime('now'));
