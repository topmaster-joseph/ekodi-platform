#!/usr/bin/env node
// Read-only, deterministic classification for an owner-approved DEV guard
// migration. Never interprets migration history alone as security proof.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const REQUIRED_FLAGS=Object.freeze([
  'required_tables','previous_20_recorded',
  'guard_not_recorded','guard_recorded','no_partial_guard','guards_verified',
  'active_credit_disabled','devotional_credit_disabled',
  'ledger_empty','wallets_zero','no_e2e_sites',
]);

export function classifyPointsDevelopmentGuardPreflight(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 ||
      !rows[0] || typeof rows[0] !== 'object' || Array.isArray(rows[0]))
    throw new Error('POINTS_DEV_GUARD_UNEXPECTED_PREFLIGHT_SHAPE');
  const state=rows[0];
  const actual=Object.keys(state);
  if (actual.length !== REQUIRED_FLAGS.length ||
      actual.some(key=>!REQUIRED_FLAGS.includes(key)) ||
      REQUIRED_FLAGS.some(key=>typeof state[key] !== 'boolean'))
    throw new Error('POINTS_DEV_GUARD_UNEXPECTED_PREFLIGHT_FLAGS');
  for (const common of ['required_tables','previous_20_recorded',
    'active_credit_disabled','devotional_credit_disabled',
    'ledger_empty','wallets_zero','no_e2e_sites']) {
    if (state[common] !== true)
      throw new Error('POINTS_DEV_GUARD_COMMON_PREFLIGHT_BLOCKED:'+common);
  }
  const fresh=state.guard_not_recorded === true &&
    state.guard_recorded === false &&
    state.no_partial_guard === true &&
    state.guards_verified === false;
  const installed=state.guard_not_recorded === false &&
    state.guard_recorded === true &&
    state.no_partial_guard === false &&
    state.guards_verified === true;
  if (fresh === installed)
    throw new Error('POINTS_DEV_GUARD_PARTIAL_OR_AMBIGUOUS_STATE');
  return fresh ? 'fresh' : 'already_applied';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const raw=readFileSync(0,'utf8');
    process.stdout.write(classifyPointsDevelopmentGuardPreflight(JSON.parse(raw))+'\n');
  } catch (error) {
    console.error('::error title=Points development guard preflight blocked::'+String(error?.message||error));
    process.exitCode=2;
  }
}
