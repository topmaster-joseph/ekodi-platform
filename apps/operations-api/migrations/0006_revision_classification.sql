ALTER TABLE cms_revisions ADD COLUMN data_classification TEXT NOT NULL DEFAULT 'public'
  CHECK(data_classification IN ('public', 'internal', 'confidential', 'restricted'));
