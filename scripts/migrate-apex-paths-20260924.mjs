// One-time EKODI apex-path migration is complete.
// This entrypoint is intentionally read-only so repeated CI runs cannot rewrite hostname,
// Origin, or route semantics after the migration has already been applied.
import './zero-subdomain-guard.mjs';

console.log('Apex-path migration is complete; read-only guard passed with no EKODI-owned child-host references.');
