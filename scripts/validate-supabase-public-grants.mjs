import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENFORCEMENT_MIGRATION = '20260924150000_supabase_public_explicit_grants.sql';
const API_ROLES = ['anon', 'authenticated', 'service_role'];

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

function splitStatements(sql) {
  return stripComments(sql)
    .split(';')
    .map(value => value.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function objectStatements(parts, kind, name) {
  const ref = new RegExp('\\bpublic\\.["]?' + escapeRegExp(name) + '["]?\\b', 'i');
  const objectKind = kind === 'function'
    ? /\\bon\\s+function\\b/i
    : kind === 'sequence'
      ? /\\bon\\s+(?:sequence\\s+)?/i
      : /\\bon\\s+(?:table\\s+)?/i;
  return parts.filter(statement =>
    /^(?:grant|revoke)\b/i.test(statement) &&
    objectKind.test(statement) &&
    ref.test(statement)
  );
}

function hasAllApiRoles(text) {
  return API_ROLES.every(role => new RegExp('\\b' + role + '\\b', 'i').test(text));
}

export function auditMigrationText(sql, filename = 'migration.sql') {
  const clean = stripComments(sql);
  const parts = splitStatements(sql);
  const issues = [];

  const tableNames = [...clean.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.["]?([a-zA-Z0-9_]+)["]?/gi)]
    .map(match => match[1]);

  for (const name of new Set(tableNames)) {
    const rls = new RegExp(
      'alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.["]?' +
      escapeRegExp(name) +
      '["]?\\s+enable\\s+row\\s+level\\s+security',
      'i'
    );
    if (!rls.test(clean)) {
      issues.push(filename + ': public.' + name + ' must enable RLS in the creating migration');
    }

    const controls = objectStatements(parts, 'table', name);
    if (!controls.length) {
      issues.push(filename + ': public.' + name + ' needs an explicit GRANT or REVOKE for Data API roles');
      continue;
    }

    const hasGrant = controls.some(statement => /^grant\b/i.test(statement));
    if (!hasGrant && !hasAllApiRoles(controls.join(' '))) {
      issues.push(filename + ': private public.' + name + ' must explicitly revoke anon, authenticated, and service_role');
    }
  }

  const functionNames = [...clean.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.["]?([a-zA-Z0-9_]+)["]?\s*\(/gi)]
    .map(match => match[1]);

  for (const name of new Set(functionNames)) {
    const controls = objectStatements(parts, 'function', name);
    if (!controls.length) {
      issues.push(filename + ': public.' + name + '(...) needs an explicit GRANT/REVOKE EXECUTE decision');
    }
  }

  const sequenceNames = [...clean.matchAll(/create\s+sequence\s+(?:if\s+not\s+exists\s+)?public\.["]?([a-zA-Z0-9_]+)["]?/gi)]
    .map(match => match[1]);

  for (const name of new Set(sequenceNames)) {
    const controls = objectStatements(parts, 'sequence', name);
    if (!controls.length) {
      issues.push(filename + ': public.' + name + ' sequence needs an explicit GRANT or REVOKE decision');
    }
  }

  return issues;
}

export function auditMigrationDirectory(dir = 'supabase/migrations') {
  const root = process.cwd();
  const resolved = path.resolve(root, dir);
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
    throw new Error('Migration directory not found inside repository: ' + dir);
  }

  const files = fs.readdirSync(resolved)
    .filter(name => name.endsWith('.sql') && name.localeCompare(ENFORCEMENT_MIGRATION, 'en') >= 0)
    .sort((a, b) => a.localeCompare(b, 'en'));

  const issues = [];
  for (const file of files) {
    issues.push(...auditMigrationText(fs.readFileSync(path.join(resolved, file), 'utf8'), file));
  }
  return { files, issues };
}

async function main() {
  const dir = process.argv[2] || 'supabase/migrations';
  const { files, issues } = auditMigrationDirectory(dir);
  if (issues.length) {
    for (const issue of issues) console.error('❌ ' + issue);
    console.error('Supabase public-object grant gate failed. Declare Data API privileges explicitly.');
    process.exit(1);
  }
  console.log('✅ ' + files.length + ' post-cutover Supabase migration(s) declare explicit public-object access.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
