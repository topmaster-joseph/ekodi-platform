-- EKODI-MALL-PRODUCT-PHOTOS-001: seller product photos (R2 keys under ekodimall/products/).
ALTER TABLE products ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]';
