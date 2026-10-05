import {resolveBoardEngine} from './board-engine-registry.js';
import {boardAdapterCapabilities} from './common-board-adapter.js';

const reason=error=>String(error?.message||error||'board_engine_failed').slice(0,240);

export function createReplaceableBoard({adapter,preferredEngine,engineClient,allowPrerelease=false}={}){
  if(!adapter)throw new Error('board_adapter_required');
  const fallback=resolveBoardEngine({preferred:'ekodi-native'});
  const selected=resolveBoardEngine({preferred:preferredEngine,allowPrerelease})||fallback;
  if(!selected||!fallback)throw new Error('board_engine_unavailable');
  try{
    const board=selected.createBoard({adapter,client:engineClient});
    return Object.freeze({
      engineId:selected.id,
      requestedEngineId:preferredEngine||selected.id,
      board:board||adapter,
      capabilities:boardAdapterCapabilities(adapter),
      fallbackEngineId:'ekodi-native',
      degraded:false,
      fallbackReason:''
    });
  }catch(error){
    if(selected.id==='ekodi-native')throw error;
    const board=fallback.createBoard({adapter});
    return Object.freeze({
      engineId:'ekodi-native',
      requestedEngineId:selected.id,
      board:board||adapter,
      capabilities:boardAdapterCapabilities(adapter),
      fallbackEngineId:'ekodi-native',
      degraded:true,
      fallbackReason:reason(error)
    });
  }
}
