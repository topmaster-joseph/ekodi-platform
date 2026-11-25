// Pure planning only. Call within a durable server transaction that rechecks active membership and atomically compares expected fields; never trust client membership or use this alone as authorization. No external POS writes.
export function canAccess(member, storeId) {
  return !!member?.userId && Array.isArray(member.memberships) && member.memberships.some(m=>m.storeId===storeId && m.active===true && ['rider','manager'].includes(m.role));
}

export function riderOrders(member,orders) {
  return orders.filter(o=>canAccess(member,o.storeId)).map(o=>({id:o.id,storeId:o.storeId,reference:o.reference,status:o.status,version:o.version,assignedToMe:o.riderId===member.userId,claimed:Boolean(o.riderId),source:o.source}));
}

export function planTransition(member, order, action, expectedVersion) {
  if(!order || !canAccess(member,order.storeId) || !member.memberships.some(m=>m.storeId===order.storeId&&m.active===true&&m.role==='rider')) return {ok:false,error:'forbidden'};
  if(!Number.isSafeInteger(expectedVersion)||order.version!==expectedVersion) return {ok:false,error:'conflict'};
  const next={claim:['ready','claimed'],pickup:['claimed','picked_up'],complete:['picked_up','completed'],release:['claimed','ready']}[action];
  if(!Array.isArray(next)||order.status!==next[0]) return {ok:false,error:'invalid_transition'};
  if(action==='claim'?order.riderId!=null:order.riderId!==member.userId) return {ok:false,error:'already_assigned_or_not_owner'};
  return {ok:true,patch:{status:next[1],riderId:action==='release'?null:member.userId,version:order.version+1},expected:{storeId:order.storeId,id:order.id,version:order.version,status:order.status,riderId:order.riderId},audit:{actorId:member.userId,action,orderId:order.id,storeId:order.storeId}};
}
