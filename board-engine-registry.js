const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const registry=new Map();

export function registerBoardEngine(engine){
  const id=clean(engine?.id);
  if(!id||typeof engine?.createBoard!=='function')throw new Error('board_engine_invalid');
  registry.set(id,Object.freeze({...engine,id}));
  return registry.get(id);
}
export function getBoardEngine(id){return registry.get(clean(id))||null;}
export function listBoardEngines(){return [...registry.values()].map(({id,license,stability,selfHosted,clientRequired})=>({id,license,stability,selfHosted,clientRequired:Boolean(clientRequired)}));}
export function resolveBoardEngine({preferred,fallback='ekodi-native',allowPrerelease=false}={}){
  const candidate=getBoardEngine(preferred);
  if(candidate&&candidate.selfHosted!==false&&(allowPrerelease||candidate.stability==='stable'))return candidate;
  return getBoardEngine(fallback);
}
registerBoardEngine({id:'ekodi-native',license:'internal',stability:'stable',selfHosted:true,clientRequired:false,createBoard:({adapter})=>adapter});
registerBoardEngine({id:'flarum',license:'MIT',stability:'prerelease',selfHosted:true,clientRequired:true,createBoard:({adapter,client})=>{if(!client?.createBoard)throw new Error('board_engine_client_required');return client.createBoard(adapter)}});
registerBoardEngine({id:'nodebb',license:'GPL-3.0',stability:'stable',selfHosted:true,clientRequired:true,createBoard:({adapter,client})=>{if(!client?.createBoard)throw new Error('board_engine_client_required');return client.createBoard(adapter)}});
