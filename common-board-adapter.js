/**
 * EKODI Common Board Adapter
 *
 * Stable, provider-independent contract for every interactive EKODI board.
 * Canonical EKODI URLs, auth, UI, audit and data ownership remain outside the
 * replaceable board engine.
 */
const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
export const BOARD_ADAPTER_OPERATIONS=Object.freeze([
  'list','read','create','reply','edit','delete','moderate','attachments','health','consume'
]);

export function createBoardAdapter({
  boardId,
  list,
  read,
  create,
  reply,
  edit,
  delete:remove,
  moderate,
  attachments,
  health,
  consume
}={}){
  if(!clean(boardId,120))throw new Error('board_adapter_id_required');
  if(typeof list!=='function'||typeof create!=='function')throw new Error('board_adapter_read_write_required');
  const adapter={
    boardId:clean(boardId,120),
    list,
    read:typeof read==='function'?read:null,
    create,
    reply:typeof reply==='function'?reply:null,
    edit:typeof edit==='function'?edit:null,
    delete:typeof remove==='function'?remove:null,
    moderate:typeof moderate==='function'?moderate:null,
    attachments:typeof attachments==='function'?attachments:null,
    health:typeof health==='function'?health:null,
    consume:typeof consume==='function'?consume:null
  };
  adapter.capabilities=Object.freeze(BOARD_ADAPTER_OPERATIONS.filter(key=>typeof adapter[key]==='function'));
  return Object.freeze(adapter);
}

export function boardAdapterCapabilities(adapter){
  return Object.freeze([...(adapter?.capabilities||[])]);
}

export async function handleBoardAdapter(adapter,{action,request,env,itemId,attachmentId,payload}={}){
  if(!adapter)return null;
  const id=Number(itemId);
  if(action==='list')return adapter.list(request,env,payload);
  if(action==='read'&&adapter.read)return adapter.read(request,env,id,payload);
  if(action==='create')return adapter.create(request,env,payload);
  if(action==='reply'&&adapter.reply)return adapter.reply(request,env,id,payload);
  if(action==='edit'&&adapter.edit)return adapter.edit(request,env,id,payload);
  if(action==='delete'&&adapter.delete)return adapter.delete(request,env,id,payload);
  if(action==='moderate'&&adapter.moderate)return adapter.moderate(request,env,id,payload);
  if(action==='attachments'&&adapter.attachments)return adapter.attachments(request,env,id,Number(attachmentId||0),payload);
  if(action==='health'&&adapter.health)return adapter.health(request,env,payload);
  return null;
}

export async function consumeBoardAdapter(adapter,envelope,env){
  if(!adapter?.consume)return false;
  return adapter.consume(envelope,env);
}
