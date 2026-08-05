export const DATABASE_NAME = 'ekodi-auth';
export const DATABASE_BINDING = 'DB';
export const MIGRATIONS = Object.freeze([
  '0001_initial.sql',
  '0002_password_iterations.sql',
  '0003_multisite_cms.sql',
  '0004_media_assets.sql',
  '0005_content_classification.sql',
  '0006_revision_classification.sql'
]);

export interface DatabaseBinding {
  prepare(query: string): unknown;
}

export function databaseFromEnv(env: Record<string, unknown> | null | undefined): DatabaseBinding | null {
  const database = env?.[DATABASE_BINDING];
  return database && typeof (database as DatabaseBinding).prepare === 'function' ? database as DatabaseBinding : null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:UNIQUE constraint failed|D1_ERROR:\s*UNIQUE)/i.test(message);
}
