ALTER TABLE cms_pages ADD COLUMN data_classification TEXT NOT NULL DEFAULT 'public'
  CHECK(data_classification IN ('public', 'internal', 'confidential', 'restricted'));

CREATE INDEX IF NOT EXISTS cms_pages_publication_idx
  ON cms_pages(site_id, status, data_classification, published_at DESC);
