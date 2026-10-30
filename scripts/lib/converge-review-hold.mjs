// Review states are ordered in the GitHub REST review event stream.
// A COMMENTED review never clears a prior CHANGES_REQUESTED by that reviewer.
// This is a resource-saving early hold, NOT a substitute for GitHub protection.
const finalStates=new Set(['APPROVED','CHANGES_REQUESTED','DISMISSED']);
export function pendingReviewBlocks(reviews) {
  if (!Array.isArray(reviews)) throw Error('REVIEW_EVIDENCE_UNAVAILABLE');
  const latest=new Map();
  for(const item of reviews){
    const login=String(item?.user?.login||'').toLowerCase();
    const state=String(item?.state||'').toUpperCase();
    if(login && finalStates.has(state)) latest.set(login,state);
  }
  return [...latest.entries()].filter(([,state])=>state==='CHANGES_REQUESTED')
    .map(([login])=>login).sort();
}
