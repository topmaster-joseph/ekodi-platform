// Fail-closed proof validation; GitHub comments and issue label events are independent evidence.
export function findExactHumanGateApproval({comments,events,policyOwners,approvalMarker,approvalLabel}) {
  if(!Array.isArray(comments)||!Array.isArray(events)||!Array.isArray(policyOwners))return null;
  const owners=new Set(policyOwners);
  const labeled=events.filter(item=>
    item?.event==='labeled'&&item?.label?.name===approvalLabel&&
    Number.isFinite(Date.parse(item?.created_at||''))
  );
  for(const comment of comments){
    if(!owners.has(comment?.user?.login)||comment?.user?.type==='Bot')continue;
    if(typeof comment?.body!=='string'||comment.body!==approvalMarker)continue;
    const created=Date.parse(comment.created_at||'');
    const edited=Date.parse(comment.updated_at||comment.created_at||'');
    if(!Number.isFinite(created)||!Number.isFinite(edited))continue;
    // A label applied before the human's comment, or before its last edit,
    // cannot serve as approval for the exact text currently being inspected.
    const applied=labeled.find(item=>Date.parse(item.created_at)>Math.max(created,edited));
    if(applied)return {approvalComment:comment,labelEvent:applied};
  }
  return null;
}
