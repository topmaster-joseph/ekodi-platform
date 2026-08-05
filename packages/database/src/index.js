export const DATABASE_NAME = 'ekodi-auth';
export const DATABASE_BINDING = 'DB';
export const MIGRATIONS = Object.freeze([
  '0001_initial.sql',
  '0002_password_iterations.sql',
  '0003_multisite_cms.sql',
  '0004_media_assets.sql'
]);

export function databaseFromEnv(env) {
  const database = env?.[DATABASE_BINDING];
  return database && typeof database.prepare === 'function' ? database : null;
}

export function isUniqueConstraintError(error) {
  return /(?:UNIQUE constraint failed|D1_ERROR:\s*UNIQUE)/i.test(String(error?.message || error || ''));
}
