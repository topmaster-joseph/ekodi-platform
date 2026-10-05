/**
 * EKODI Board Runtime Guard
 *
 * Core board operations are always served by the EKODI Board Adapter.
 * Replaceable engines and AI-powered enhancements are optional extensions and
 * are never allowed onto the synchronous CRUD/read critical path.
 */
export const BOARD_CORE_OPERATIONS=Object.freeze([
  'list','read','search','create','reply','edit','delete','moderate','attachments','health','consume'
]);

const clean=(value,max=160)=>String(value??'').trim().slice(0,max);

export function createBoardRuntimeGuard({adapter,extension=null,extensionId=''}={}){
  if(!adapter?.boardId)throw new Error('board_runtime_adapter_required');

  const runtime={
    boardId:clean(adapter.boardId,120),
    capabilities:Object.freeze([...(adapter.capabilities||[])]),
    aiIndependent:true,
    coreSource:'ekodi-board-adapter',
    extensionId:clean(extensionId,120),
    extension:extension||null
  };

  for(const operation of BOARD_CORE_OPERATIONS){
    if(typeof adapter[operation]==='function'){
      runtime[operation]=(...args)=>adapter[operation](...args);
    }
  }

  return Object.freeze(runtime);
}
