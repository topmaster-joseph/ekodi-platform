import {resolveBoardEngine} from './board-engine-registry.js';
export function createReplaceableBoard({adapter,preferredEngine,engineClient,allowPrerelease=false}={}){
  if(!adapter)throw new Error('board_adapter_required');
  const engine=resolveBoardEngine({preferred:preferredEngine,allowPrerelease});
  if(!engine)throw new Error('board_engine_unavailable');
  const board=engine.createBoard({adapter,client:engineClient});
  return Object.freeze({engineId:engine.id,board:board||adapter,fallbackEngineId:'ekodi-native'});
}
