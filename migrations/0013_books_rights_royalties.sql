CREATE TABLE IF NOT EXISTS books_rightsholders (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  payout_reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  FOREIGN KEY (created_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS books_publication_rights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL,
  rightsholder_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'author',
  royalty_basis TEXT NOT NULL DEFAULT 'net_receipts',
  royalty_rate_bps INTEGER NOT NULL DEFAULT 0,
  fixed_per_unit_krw INTEGER NOT NULL DEFAULT 0,
  territory TEXT NOT NULL DEFAULT 'WORLD',
  exclusive INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL DEFAULT '',
  effective_to TEXT NOT NULL DEFAULT '',
  contract_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  FOREIGN KEY (publication_id) REFERENCES books_publications(id) ON DELETE CASCADE,
  FOREIGN KEY (rightsholder_id) REFERENCES books_rightsholders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_publication_rights_publication ON books_publication_rights(publication_id, status);
CREATE INDEX IF NOT EXISTS idx_books_publication_rights_holder ON books_publication_rights(rightsholder_id, status);

CREATE TABLE IF NOT EXISTS books_royalty_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_no TEXT NOT NULL UNIQUE,
  rightsholder_id TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  basis_amount_krw INTEGER NOT NULL DEFAULT 0,
  royalty_amount_krw INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT NOT NULL DEFAULT '',
  payout_ref TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  FOREIGN KEY (rightsholder_id) REFERENCES books_rightsholders(id),
  FOREIGN KEY (created_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_books_royalty_statements_holder ON books_royalty_statements(rightsholder_id, period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_books_royalty_statements_status ON books_royalty_statements(status, period_to);

CREATE TABLE IF NOT EXISTS books_royalty_statement_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER NOT NULL,
  publication_id TEXT NOT NULL,
  channel_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'author',
  royalty_basis TEXT NOT NULL,
  sales_krw INTEGER NOT NULL DEFAULT 0,
  refunds_krw INTEGER NOT NULL DEFAULT 0,
  channel_fees_krw INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  basis_amount_krw INTEGER NOT NULL DEFAULT 0,
  royalty_rate_bps INTEGER NOT NULL DEFAULT 0,
  fixed_per_unit_krw INTEGER NOT NULL DEFAULT 0,
  royalty_amount_krw INTEGER NOT NULL DEFAULT 0,
  contract_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (statement_id) REFERENCES books_royalty_statements(id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES books_publications(id)
);

CREATE INDEX IF NOT EXISTS idx_books_royalty_lines_statement ON books_royalty_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_books_royalty_lines_publication ON books_royalty_statement_lines(publication_id, channel_code);
