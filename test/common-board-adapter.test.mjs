import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardAdapter,handleBoardAdapter,boardAdapterCapabilities} from '../common-board-adapter.js';
import {createReplaceableBoard} from '../replaceable-board-provider.js';

const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const adapter=createBoardAdapter({
  boardId:'test.board',
  list:()=>response({op:'list'}),
  read:(_r,_e,id)=>response({op:'read',id}),
  create:()=>response({op:'create'}),
  reply:(_r,_e,id)=>response({op:'reply',id}),
  edit:(_r,_e,id)=>response({op:'edit',id}),
  delete:(_r,_e,id)=>response({op:'delete',id}),
  moderate:(_r,_e,id)=>response({op:'moderate',id}),
  attachments:(_r,_e,id,index)=>response({op:'attachments',id,index})
});

test('common adapter exposes core board operations',async()=>{
  for(const action of ['list','read','create','reply','edit','delete','moderate','attachments']){
    const result=await handleBoardAdapter(adapter,{action,request:new Request('https://ekodi.kr/'),env:{},itemId:7,attachmentId:2});
    assert.equal((await result.json()).op,action);
  }
  for(const operation of ['list','read','create','reply','edit','delete','moderate','attachments']){
    assert.ok(boardAdapterCapabilities(adapter).includes(operation));
  }
});

test('external board engine without a client does not masquerade as active',()=>{
  assert.throws(
    ()=>createReplaceableBoard({adapter,preferredEngine:'nodebb'}),
    /board_engine_client_required/
  );
});

test('external board engine is used when its client succeeds',()=>{
  const client={createBoard:value=>({wrapped:value})};
  const board=createReplaceableBoard({adapter,preferredEngine:'nodebb',engineClient:client});
  assert.equal(board.engineId,'nodebb');
  assert.equal(board.board.wrapped,adapter);
});
