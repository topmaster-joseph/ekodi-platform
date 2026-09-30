const cacheByDb = new WeakMap();
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function cacheFor(db) {
  let cache = cacheByDb.get(db);
  if (!cache) { cache = new Map(); cacheByDb.set(db, cache); }
  return cache;
}

export async function d1SchemaReady(db, tables, { ttlMs = 300000, negativeTtlMs = 30000 } = {}) {
  if (!db?.prepare || !Array.isArray(tables) || !tables.length) return false;
  const names = [...new Set(tables.map(String))];
  if (names.some(name => !IDENTIFIER.test(name))) return false;
  const key = names.slice().sort().join('|');
  const now = Date.now();
  const cache = cacheFor(db);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const probes = names.map(name => db.prepare(`SELECT 1 FROM "${name}" LIMIT 0`));
    if (typeof db.batch === 'function') await db.batch(probes);
    else for (const probe of probes) await probe.all();
    cache.set(key, { value: true, expiresAt: now + ttlMs });
    return true;
  } catch {
    cache.set(key, { value: false, expiresAt: now + negativeTtlMs });
    return false;
  }
}
