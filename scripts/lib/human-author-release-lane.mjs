// Production deployment policy only. The EKODI Orchestrator executes this
// after authentic GitHub checks and protected merging; this module does not deploy.
const TARGET='deploy-human-author-schema.yml';
const HUMAN_SCHEMA_FILES=new Set([
  'supabase/migrations/20261028010000_human_author_membership_writing.sql',
  '.github/workflows/deploy-human-author-schema.yml',
  'scripts/lib/human-author-release-lane.mjs',
  'scripts/sql/human-author-release-preflight.sql',
  'scripts/sql/human-author-release-postflight.sql',
]);
const AUTHOR_FILES=new Set([
  'author-worker.js','wrangler.author.toml','wrangler.author.staging.toml',
  '.github/workflows/deploy-author.yml','deploy/manifests/author.worker.json',
]);
const SHA=/^[a-f0-9]{40}$/i;
const TASK=/^ai\/[a-z0-9._-]+\/(orch_[a-z0-9_-]{16,120})$/i;
export function requiresHumanAuthorSchemaRelease(files) {
  return Array.isArray(files) && files.some(path => HUMAN_SCHEMA_FILES.has(path));
}
export function requiresCreatorAuthorRelease(files) {
  return Array.isArray(files) && files.some(path => path.startsWith('author/') || AUTHOR_FILES.has(path));
}
export function releaseSpecForHumanAuthorSchema({changedFiles,branch,mergeSha}) {
  if(!requiresHumanAuthorSchemaRelease(changedFiles)) return null;
  const match=String(branch||'').match(TASK);
  if(!match || !SHA.test(String(mergeSha||''))) throw new Error('human_author_release_requires_exact_orchestrator_receipt_and_main_sha');
  return Object.freeze({workflow:TARGET,ref:'main',
    inputs:Object.freeze({release_branch_ref:branch,release_task_id:match[1],expected_main_sha:mergeSha})});
}
export function releaseSpecForCreatorAuthor({changedFiles,branch}) {
  if(!requiresCreatorAuthorRelease(changedFiles)) return null;
  const match=String(branch||'').match(TASK);
  if(!match) throw new Error('creator_author_release_requires_orchestrator_receipt');
  return Object.freeze({workflow:'deploy-author.yml',ref:'main',
    inputs:Object.freeze({release_branch_ref:branch,release_task_id:match[1]})});
}
