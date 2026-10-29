// PUBLISH-PIPELINE-001 / EKODI Orchestrator sole authority for execution.
// Pure state machine: no direct AI charges, catalog edits or publication side effects.
import { evaluateReleaseReadiness, approvedDualChannelHandoff } from './human/editorial-policy.js';

export const STAGES = Object.freeze([
  'planning','drafting','in_review','changes_requested','ready_for_author',
  'author_approved','publisher_approved','scheduled','handoff_ready','released'
]);
export const AI_TASKS = Object.freeze(['research','outline','draft','revision','fact_check','literary_edit','accessibility']);
const EDITABLE = new Set(['planning','drafting','changes_requested']);
const DATE_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const ALLOWED_CHANNELS = new Set(['books','ekodimall']);
export function validScheduledAt(value, now = new Date()) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const timestamp=Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime()) return false;
  return Number.isFinite(timestamp) && new Date(timestamp).getUTCFullYear() >= 2026;
}
function fail(code, detail) { return { ok:false, code, blockers: detail ? [detail] : [] }; }
function assertRole(action, user, project) {
  const role=user?.role;
  if (!user?.userId) return false;
  // Even a highest administrator may not forge the author's personal consent.
  if (action === 'author_approve') return user.userId === project.authorUserId;
  if (role === 'admin') return true;
  if (action === 'publisher_approve' || action === 'schedule' || action === 'prepare_handoff' ||
    action === 'release_receipt') return role === 'publisher';
  if (action === 'editor_pass' || action === 'request_changes') return role === 'editor' || role === 'publisher';
  if (action === 'submit' || action === 'revise') return user.userId===project.authorUserId || role === 'editor';
  return false;
}
const isSha=value => HASH_RE.test(String(value || ''));
export function publicationTransition(project, action, input, user, now=new Date(), verification={}) {
  if (!project || !STAGES.includes(project.stage)) return fail('BAD_PROJECT');
  if (!assertRole(action,user,project)) return fail('FORBIDDEN');
  const copy={...project};
  const original=project.stage;
  if (action==='revise') {
    if (!EDITABLE.has(original)) return fail('FROZEN_EDITION');
    const digest=String(input?.manuscriptDigest || '');
    if (!isSha(digest)) return fail('MANUSCRIPT_DIGEST_REQUIRED');
    if (digest===project.manuscriptDigest && !input?.changedMetadata) return fail('NOTHING_CHANGED');
    copy.manuscriptDigest=digest;
    copy.stage='drafting';
    copy.releaseDigest=null;
    copy.authorApproval=null;
    copy.publisherApproval=null;
    copy.scheduledAt=null;
    copy.readyAt=null;
    copy.handoffId=null;
    return {ok:true,next:copy};
  }
  if (action==='submit') {
    if (!['drafting','changes_requested'].includes(original)) return fail('WRONG_STAGE');
    if (verification.ready!==true) return fail('PAID_PUBLISHING_SUBMISSION_REQUIRED',verification.reason||'');
    if (!isSha(project.manuscriptDigest)) return fail('MANUSCRIPT_REQUIRED');
    copy.stage='in_review';return {ok:true,next:copy};
  }
  if (action==='request_changes') {
    if (original!=='in_review') return fail('WRONG_STAGE');
    if (!String(input?.notes||'').trim()) return fail('REVIEW_NOTES_REQUIRED');
    copy.stage='changes_requested';return {ok:true,next:copy};
  }
  if (action==='editor_pass') {
    if (original!=='in_review') return fail('WRONG_STAGE');
    if (!input?.checklist || input.checklist.completed !== true) return fail('EDITING_INCOMPLETE');
    if (!isSha(project.releaseDigest)) return fail('RELEASE_DIGEST_REQUIRED');
    copy.stage='ready_for_author';return {ok:true,next:copy};
  }
  if (action==='author_approve') {
    if (original!=='ready_for_author') return fail('WRONG_STAGE');
    if (!isSha(project.releaseDigest)||input?.digest!==project.releaseDigest) return fail('EDITION_MISMATCH');
    if(input?.rightsConsent!==true)return fail('AUTHOR_RIGHTS_CONSENT_REQUIRED');
    copy.authorApproval={actor:user.userId,digest:project.releaseDigest,approvedAt:now.toISOString()};
    copy.stage='author_approved';return {ok:true,next:copy};
  }
  if (action==='publisher_approve') {
    if (original!=='author_approved') return fail('WRONG_STAGE');
    if (verification.ready!==true) return fail('COMMERCIAL_VERIFICATION_REQUIRED',verification.reason||'');
    if (!isSha(project.releaseDigest)||project.authorApproval?.digest!==project.releaseDigest)
      return fail('AUTHOR_APPROVAL_STALE');
    if (input?.digest!==project.releaseDigest) return fail('EDITION_MISMATCH');
    const publisherApproval={approvedBy:user.userId,digest:project.releaseDigest,approvedAt:now.toISOString()};
    // Reuse the shared Human Publishing release readiness contract; no bypass.
    const ready=evaluateReleaseReadiness({...project.releaseCandidate,publisherApproval,
      publicationId:project.publicationId,editionId:project.editionId,title:project.title,
      authorId:project.authorUserId,fieldId:project.fieldId,releaseDigest:project.releaseDigest,
      collectionId:project.collectionId,seriesId:project.seriesId});
    if(!ready.ready)return fail('RELEASE_QA_BLOCKED',ready.blockers.join(';'));
    copy.publisherApproval=publisherApproval;copy.stage='publisher_approved';return {ok:true,next:copy};
  }
  if (action==='schedule') {
    if(original!=='publisher_approved')return fail('WRONG_STAGE');
    if(verification.ready!==true)return fail('COMMERCIAL_VERIFICATION_REQUIRED',verification.reason||'');
    if (input?.digest!==project.releaseDigest) return fail('EDITION_MISMATCH');
    if (!validScheduledAt(input?.scheduledAt,now)) return fail('INVALID_RELEASE_SCHEDULE');
    const channels=input?.channels;
    if (!Array.isArray(channels)||channels.length!==2||
      new Set(channels).size!==2||channels.some(x=>!ALLOWED_CHANNELS.has(x))) return fail('DUAL_CHANNEL_REQUIRED');
    copy.stage='scheduled';copy.scheduledAt=input.scheduledAt;copy.releaseChannels=[...channels];
    return {ok:true,next:copy};
  }
  if (action==='prepare_handoff') {
    if(original!=='scheduled')return fail('WRONG_STAGE');
    if(verification.ready!==true)return fail('COMMERCIAL_VERIFICATION_REQUIRED',verification.reason||'');
    if (!project.scheduledAt||Date.parse(project.scheduledAt)>now.getTime())return fail('NOT_DUE');
    if (!isSha(project.releaseDigest) || project.publisherApproval?.digest!==project.releaseDigest ||
      project.authorApproval?.digest!==project.releaseDigest) return fail('STALE_APPROVALS');
    const candidate={...project.releaseCandidate,publisherApproval:project.publisherApproval,
      publicationId:project.publicationId,editionId:project.editionId,title:project.title,
      authorId:project.authorUserId,fieldId:project.fieldId,releaseDigest:project.releaseDigest,
      collectionId:project.collectionId,seriesId:project.seriesId};
    try { copy.handoffProposal=approvedDualChannelHandoff(candidate); }
    catch { return fail('RELEASE_QA_BLOCKED'); }
    copy.stage='handoff_ready';copy.readyAt=now.toISOString();
    // NO automatic sale, product registration, public catalog updates, or dispatch.
    return {ok:true,next:copy};
  }
  if (action==='release_receipt') {
    // A signed channel dispatcher, not a user form, is responsible for proof of sale-ready activation.
    if(verification.ready!==true)return fail('COMMERCIAL_VERIFICATION_REQUIRED');
    if (original!=='handoff_ready')return fail('WRONG_STAGE');
    if(input?.serverVerified!==true || input?.digest!==project.releaseDigest ||
       input?.booksReceipt?.editionDigest!==project.releaseDigest ||
       input?.mallReceipt?.editionDigest!==project.releaseDigest)return fail('RECEIPTS_NOT_VERIFIED');
    copy.stage='released';copy.releasedAt=now.toISOString();
    return {ok:true,next:copy};
  }
  return fail('UNKNOWN_ACTION');
}
export function scheduleReadiness(project, now=new Date()) {
  return Boolean(project?.stage==='scheduled'&&project.scheduledAt&&
    Date.parse(project.scheduledAt)<=now.getTime() &&
    project.authorApproval?.digest===project.releaseDigest&&
    project.publisherApproval?.digest===project.releaseDigest);
}
export function permittedAiRequest(kind,{provider='core',spendKrw=0,ownerConsent=false}={}) {
  if (!AI_TASKS.includes(kind)) return fail('UNKNOWN_AI_TASK');
  if (provider!=='core' || spendKrw!==0) return fail('PAID_PROVIDER_APPROVAL_REQUIRED');
  if (!ownerConsent) return fail('AUTHOR_CONSENT_REQUIRED');
  return {ok:true,kind,state:'queued',provider:'core',spendKrw:0};
}
