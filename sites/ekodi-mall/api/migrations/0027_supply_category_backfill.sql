-- EKODI-MALL-NATURAL-CATEGORY-001: one-time, reversible reclassification
-- of previously auto-imported supplier products. Keep existing user-selected
-- 'general', 'book' and 'gift' categories untouched and never expose sources.
UPDATE products
SET category='gift', updated_at=datetime('now')
WHERE supply_provider='domeggook' AND category='living'
  AND (
    name LIKE '%크리스마스%' OR name LIKE '%선물%' OR name LIKE '%기념품%'
    OR name LIKE '%선물포장%' OR name LIKE '%리본%' OR name LIKE '%다이어리%'
    OR name LIKE '%캘린더%' OR name LIKE '%달력%' OR name LIKE '%축하%'
    OR EXISTS (
      SELECT 1 FROM supply_candidates c
      WHERE c.product_id=products.id AND (
        c.keyword LIKE '%크리스마스%' OR c.keyword LIKE '%선물%'
        OR c.keyword LIKE '%포장%' OR c.keyword LIKE '%다이어리%'
        OR c.keyword LIKE '%캘린더%'
      )
    )
  );
