import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LEGAL_STATUSES = new Set(['pre-clearance','design-candidate-only','filed','registered','refused','withdrawn','expired']);
const MAIN_EVIDENCE = 'verified-on-main';
const PENDING_EVIDENCE = 'candidate-pr-not-merged';
const VERIFIED_OFFICIAL_HOST = /^(www\.)?(kipris\.or\.kr|patent\.go\.kr|kipo\.go\.kr)$/i;

function officialProof(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('https://')) return false;
  try { return VERIFIED_OFFICIAL_HOST.test(new URL(ref).hostname); } catch { return false; }
}

/**
 * Structural integrity guard, NOT a legal opinion or registration confirmation.
 * Evidence links and identifiers are still reviewed by an authorized human.
 */
export function validateEkodiIpRegistry(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['IP registry must be an object'];
  if (data.canonicalDomain !== 'ekodi.kr') errors.push('Unexpected canonical EKODI domain');
  if (data.governance?.noAutomaticLegalFilingOrPayment !== true) errors.push('No-autonomous-filing rule missing');
  if (data.governance?.noRegisteredSymbolBeforeRegistration !== true) errors.push('Registered-symbol restriction missing');
  if (data.governance?.noFranchiseBrandWithoutOwnerLicense !== true) errors.push('Third-party brand licensing rule missing');
  if (!Array.isArray(data.marks) || data.marks.length === 0) errors.push('Mark inventory missing');

  const seen = new Set();
  for (const mark of data.marks || []) {
    if (seen.has(mark.id)) errors.push('Duplicate mark ID: '+mark.id);
    seen.add(mark.id);
    if (!mark.id || !mark.display || !LEGAL_STATUSES.has(mark.status)) errors.push('Malformed mark: '+(mark.id||'<unknown>'));
    if (/[®]/.test(mark.display||'')) errors.push('Unverified registration symbol in a mark display: '+mark.id);
    if (/(?:\bBBQ\b|Genesis BBQ|제너시스BBQ|자담치킨)/i.test(mark.display||'')) errors.push('Third-party franchise mark in EKODI owner inventory: '+mark.id);
    if (!Array.isArray(mark.classes) || !mark.classes.length || mark.classes.some(c=>!/^\d{2}$/.test(c)||Number(c)<1||Number(c)>45)) errors.push('Invalid Nice classes: '+mark.id);
    if (mark.status === 'filed' || mark.status === 'registered') {
      const a = mark.application;
      if (!mark.holder || typeof mark.holder !== 'string') errors.push('Missing verified legal applicant: '+mark.id);
      if (!a || typeof a !== 'object' || !a.number || !a.filedAt || !officialProof(a.receiptUrl)) errors.push('Official filing evidence missing: '+mark.id);
    }
    if (mark.status === 'registered') {
      const r=mark.registration;
      if (!r || !r.number || !r.registeredAt || !officialProof(r.officialRecordUrl)) errors.push('Registration evidence missing: '+mark.id);
    }
    if (mark.status === 'pre-clearance' || mark.status === 'design-candidate-only') {
      if (mark.application?.number || mark.registration?.number) errors.push('Pre-clearance claim conflicts with legal identifiers: '+mark.id);
    }
  }
  if (data.proof?.searchEvidence?.markSpecificSearchCompleted) {
    if (!data.proof.searchEvidence.verifiedAt || !officialProof(data.proof.searchEvidence.officialSource)) errors.push('Mark-specific clearance asserted without dated official search evidence');
  }
  const entries=data.proof?.evidenceEntries;
  if (!Array.isArray(entries)||entries.length===0) errors.push('Proof chain missing');
  else for (const e of entries) {
    if (!e.location || e.location.includes('..') || e.location.startsWith('/')) errors.push('Invalid proof path');
    if (![MAIN_EVIDENCE,PENDING_EVIDENCE].includes(e.availability)) errors.push('Proof provenance unspecified: '+e.location);
    if (e.availability === PENDING_EVIDENCE && !/^https:\/\/github\.com\/topmaster-joseph\/ekodi-platform\/pull\/\d+$/.test(e.sourceRef||'')) errors.push('Unmerged candidate must identify its PR: '+e.location);
    if (e.availability === MAIN_EVIDENCE && e.sourceRef) errors.push('Verified-on-main evidence cannot point only to a draft PR: '+e.location);
  }
  return errors;
}

export async function checkEkodiIpRegistry(rootUrl = new URL('../',import.meta.url)) {
  const registry=JSON.parse(await readFile(new URL('docs/brand/rights/ekodi-ip-registry.json',rootUrl),'utf8'));
  const errors=validateEkodiIpRegistry(registry);
  for(const entry of registry.proof?.evidenceEntries||[]){
    if(entry.availability==='verified-on-main') {
      try { await readFile(new URL(entry.location,rootUrl)); }
      catch { errors.push('Evidence marked on main does not exist: '+entry.location); }
    }
  }
  return {registry,errors};
}

if (process.argv[1] && resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))) {
  const {errors}=await checkEkodiIpRegistry();
  if(errors.length) { for(const e of errors) console.error('EKODI IP evidence failure: '+e); process.exitCode=1; }
  else console.log('EKODI IP evidence structurally valid. Formal trademark clearance/registration NOT certified.');
}
