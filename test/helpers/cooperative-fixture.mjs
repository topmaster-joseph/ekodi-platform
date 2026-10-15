import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE customer_tenants(id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT, domain TEXT UNIQUE, status TEXT, created_at TEXT);
    CREATE TABLE customer_access_grants(tenant_id INTEGER, email TEXT, role TEXT, enabled INTEGER, expires_at TEXT, capabilities_json TEXT DEFAULT '[]', denied_capabilities_json TEXT DEFAULT '[]', PRIMARY KEY(tenant_id,email));
    CREATE TABLE public_site_controls(site_id TEXT PRIMARY KEY, workspace_id TEXT, domain TEXT UNIQUE, public_status TEXT, updated_at TEXT);
    CREATE TABLE admins(id INTEGER PRIMARY KEY, email TEXT, role TEXT);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER,expires_at TEXT,created_at TEXT);`);
  sqlite.exec(fs.readFileSync(new URL('../../migrations/0133_cooperative_distribution_workspaces.sql', import.meta.url), 'utf8'));
  const statement = (sql, params = []) => ({
    sql, params,
    bind(...values) { return statement(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    async run() { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
  });
  const db = { prepare: sql => statement(sql), async batch(statements) {
    sqlite.exec('BEGIN');
    try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  } };
  const grant = (coop, email, role = 'member', extra = {}) => {
    const tenant = sqlite.prepare('SELECT id FROM customer_tenants WHERE slug=?').get(coop.slug);
    sqlite.prepare('INSERT OR REPLACE INTO customer_access_grants(tenant_id,email,role,enabled,expires_at,capabilities_json,denied_capabilities_json) VALUES(?,?,?,?,?,?,?)')
      .run(tenant.id, email, role, extra.enabled ?? 1, extra.expiresAt ?? null, JSON.stringify(extra.capabilities || []), JSON.stringify(extra.denied || []));
  };
  return { sqlite, db, env: { DB: db }, grant };
}

export function authFetch(tokens = {}) {
  return async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) {
      const auth = new Headers(options.headers).get('authorization');
      const email = tokens[String(auth || '').replace(/^Bearer /, '')];
      return email ? new Response(JSON.stringify({ id: email, email, email_confirmed_at: '2026-01-01', user_metadata: { role: 'super_admin' } }), { status: 200 }) : new Response('{}', { status: 401 });
    }
    throw new Error('Unexpected external request: ' + url);
  };
}

