/**
 * EKODI Common Board Adapter
 *
 * Stable contract for commodity board features. Site-specific routes can keep
 * their canonical URL/UI while the storage engine is replaced behind this
 * adapter. The first rollout wraps SeonamMedi citizen voices without moving or
 * rewriting existing data.
 */
const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);

export function createBoardAdapter({
  boardId,
  list,
  create,
  reply,
  health,
  consume
}={}){
  if(!clean(boardId,120))throw new Error('board_adapter_id_required');
  if(typeof list!=='function'||typeof create!=='function')throw new Error('board_adapter_read_write_required');
  return Object.freeze({
    boardId:clean(boardId,120),
    list,
    create,
    reply:typeof reply==='function'?reply:null,
    health:typeof health==='function'?health:null,
    consume:typeof consume==='function'?consume:null
  });
}

export async function handleBoardAdapter(adapter,{action,request,env,itemId}={}){
  if(!adapter)return null;
  if(action==='list')return adapter.list(request,env);
  if(action==='create')return adapter.create(request,env);
  if(action==='reply'&&adapter.reply)return adapter.reply(request,env,Number(itemId));
  if(action==='health'&&adapter.health)return adapter.health(request,env);
  return null;
}

export async function consumeBoardAdapter(adapter,envelope,env){
  if(!adapter?.consume)return false;
  return adapter.consume(envelope,env);
}
