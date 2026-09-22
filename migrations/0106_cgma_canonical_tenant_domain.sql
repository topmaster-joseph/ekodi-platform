-- Normalize the active CGMA tenant directory record to the canonical EKODI apex path.
-- Legacy host aliases remain compatibility-only at the routing layer.

UPDATE customer_tenants
SET domain = 'ekodi.kr/cgma'
WHERE slug = 'cgma'
  AND domain <> 'ekodi.kr/cgma';
