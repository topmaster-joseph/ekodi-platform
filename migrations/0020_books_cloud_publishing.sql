CREATE TABLE IF NOT EXISTS books_cloud_publish_channels (
  channel_code TEXT PRIMARY KEY,
  source_provider TEXT NOT NULL DEFAULT 'google_drive',
  transport TEXT NOT NULL DEFAULT 'google_content_fetch',
  feed_status TEXT NOT NULL DEFAULT 'setup_required',
  collection_code TEXT NOT NULL DEFAULT '',
  feed_endpoint TEXT NOT NULL DEFAULT '',
  drive_root_folder_id TEXT NOT NULL DEFAULT '',
  drive_ready_folder_id TEXT NOT NULL DEFAULT '',
  drive_processing_folder_id TEXT NOT NULL DEFAULT '',
  drive_published_folder_id TEXT NOT NULL DEFAULT '',
  drive_failed_folder_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS books_cloud_publish_sources (
  publication_id TEXT PRIMARY KEY,
  source_provider TEXT NOT NULL DEFAULT 'google_drive',
  drive_folder_id TEXT NOT NULL DEFAULT '',
  drive_epub_file_id TEXT NOT NULL DEFAULT '',
  drive_cover_file_id TEXT NOT NULL DEFAULT '',
  metadata_file_id TEXT NOT NULL DEFAULT '',
  registration_file_id TEXT NOT NULL DEFAULT '',
  job_document_file_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS books_cloud_publish_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL,
  channel_code TEXT NOT NULL DEFAULT 'google-play-books',
  status TEXT NOT NULL DEFAULT 'draft',
  source_provider TEXT NOT NULL DEFAULT 'google_drive',
  transport TEXT NOT NULL DEFAULT 'google_content_fetch',
  identifier_type TEXT NOT NULL DEFAULT 'ggkey_pending',
  identifier_value TEXT NOT NULL DEFAULT '',
  drive_folder_id TEXT NOT NULL DEFAULT '',
  drive_epub_file_id TEXT NOT NULL DEFAULT '',
  drive_cover_file_id TEXT NOT NULL DEFAULT '',
  metadata_file_id TEXT NOT NULL DEFAULT '',
  collection_code TEXT NOT NULL DEFAULT '',
  feed_epub_path TEXT NOT NULL DEFAULT '',
  feed_cover_path TEXT NOT NULL DEFAULT '',
  source_status TEXT NOT NULL DEFAULT '',
  result_external_id TEXT NOT NULL DEFAULT '',
  result_product_url TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT NOT NULL DEFAULT '',
  queued_at TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requested_by INTEGER,
  approved_by INTEGER,
  updated_by INTEGER,
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_code) REFERENCES books_cloud_publish_channels(channel_code),
  FOREIGN KEY (requested_by) REFERENCES admins(id),
  FOREIGN KEY (approved_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_cloud_publish_jobs_status ON books_cloud_publish_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_cloud_publish_jobs_publication ON books_cloud_publish_jobs(publication_id, channel_code, updated_at DESC);

INSERT OR IGNORE INTO books_cloud_publish_channels (
  channel_code, source_provider, transport, feed_status, collection_code, feed_endpoint,
  drive_root_folder_id, drive_ready_folder_id, drive_processing_folder_id,
  drive_published_folder_id, drive_failed_folder_id, note, created_at, updated_at
) VALUES (
  'google-play-books', 'google_drive', 'google_content_fetch', 'setup_required', '', '',
  '1C541CDrDDuDopMgr9ZTexRK_LRGbOsUY', '1hwbtTDOM1jVlDRoaBtvHYbD92TD7-j4k',
  '1NZYauVarHUFh_-eajHq46_Wn_809frd_', '1PU-nDwl7hh2xxIJaetZcPZA-GV42U68L',
  '1SPX2HN7RFH8rtjLFZVQlvb-DO9cYTre7',
  'Google Drive is the source of truth. Google automated content fetching becomes the primary transport after Google feed onboarding is active.',
  '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'
);

INSERT OR IGNORE INTO books_cloud_publish_sources (
  publication_id, source_provider, drive_folder_id, drive_epub_file_id, drive_cover_file_id,
  metadata_file_id, registration_file_id, job_document_file_id, note, created_at, updated_at
) VALUES (
  'ekodi-books-001', 'google_drive', '1g69hELEXqXEHgpgxLv20PXTspOIgaEpZ', '', '',
  '1yVj36aEECDticXyHuam7hAahErAw9ryl27w_rsslr10',
  '1hAy2Gz0iinenQzLammVGfizcydBIyRpH6lngVBEUJ3w',
  '1wzWL2Zil0G3l_v8M0cMeyn225K1s7lAlOmL1stNAn54',
  'Final EPUB and cover must be present in this Drive source before cloud queue approval.',
  '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'
);
