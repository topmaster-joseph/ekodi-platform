// Review states are ordered in the GitHub REST review event stream.
// A COMMENTED review never clears a prior CHANGES_REQUESTED by that reviewer.
// This is a resource-saving early hold, NOT a substitute for GitHub protection.
const finalStates=new Set(['APPROVED','CHANGES_REQUESTED','DISMISSED']);
// GitHub review submissions from non-collaborators are advisory and cannot
// block a protected merge. Never let an unaffiliated public user park release.
const trustedAssociations=new Set(['OWNER','MEMBER','COLLABORATOR']);
export function pendingReviewBlocks(reviews, {requestedReviewers=[]}={}) {
  if (!Array.isArray(reviews)) throw Error('REVIEW_EVIDENCE_UNAVAILABLE');
  const latest=new Map();
  for(const item of reviews){
    const login=String(item?.user?.login||'').toLowerCase();
    const state=String(item?.state||'').toUpperCase();
    const association=String(item?.author_association||'').toUpperCase();
    if(login && (login==='topmaster-joseph'||trustedAssociations.has(association)) &&
       finalStates.has(state)) latest.set(login,state);
  }
  const blocked=new Set([...latest.entries()].filter(([,state])=>state==='CHANGES_REQUESTED')
    .map(([login])=>login));
  // A fresh owner review request also holds an unreviewed or stale-approved PR.
  // GitHub clears requested_reviewers when that request is genuinely fulfilled.
  if(Array.isArray(requestedReviewers) && requestedReviewers.some(x=>
    String(x?.login||'').toLowerCase()==='topmaster-joseph'))blocked.add('topmaster-joseph');
  return [...blocked].sort();
}
