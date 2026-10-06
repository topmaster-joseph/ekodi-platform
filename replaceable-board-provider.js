import {resolveBoardEngine} from './board-engine-registry.js';
import {boardAdapterCapabilities} from './common-board-adapter.js';
import {createBoardRuntimeGuard} from './board-runtime-guard.js';

const reason=error=>String(error?.message||error||'board_engine_failed').slice(0,240);

export function createReplaceableBoard({adapter,preferredEngine,engineClient,allowPrerelease=false}={}){
  if(!adapter)throw new Error('board_adapter_required');
  const fallback=resolveBoardEngine({preferred:'ekodi-native'});
  const selected=resolveBoardEngine({preferred:preferredEngine,allowPrerelease})||fallback;
  if(!selected||!fallback)throw new Error('board_engine_unavailable');

  let engineId=selected.id;
  let extensionBoard=null;
  let degraded=false;
  let fallbackReason='';

  try{
    const created=selected.createBoard({adapter,client:engineClient});
    if(selected.id!=='ekodi-native')extensionBoard=created||null;
  }catch(error){
    if(selected.id==='ekodi-native')throw error;
    engineId='ekodi-native';
    degraded=true;
    fallbackReason=reason(error);
  }

  const board=createBoardRuntimeGuard({
    adapter,
    extension:extensionBoard,
    extensionId:extensionBoard?engineId:''
  });

  return Object.freeze({
    engineId,
    requestedEngineId:preferredEngine||selected.id,
    coreEngineId:'ekodi-native',
    extensionEngineId:extensionBoard?engineId:null,
    board,
    extensionBoard,
    capabilities:boardAdapterCapabilities(adapter),
    fallbackEngineId:'ekodi-native',
    aiIndependent:true,
    degraded,
    fallbackReason
  });
}
