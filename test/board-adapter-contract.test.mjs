import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardAdapter,handleBoardAdapter,boardAdapterCapabilities} from '../common-board-adapter.js';

const make=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const board=createBoardAdapter({
  boardId:'contract.test',
  list:()=>make({name:'list'}),
  read:(_request,_env,id)=>make({name:'read',id}),
  create:()=>make({name:'create'}),
  edit:(_request,_env,id)=>make({name:'edit',id}),
  attachments:(_request,_env,id,index)=>make({name:'attachments',id,index})
});

test('board adapter handles detail and edit operations',async()=>{
  const read=await handleBoardAdapter(board,{action:'read',request:new Request('https://ekodi.kr/'),env:{},itemId:3});
  assert.deepEqual(await read.json(),{name:'read',id:3});
  const edit=await handleBoardAdapter(board,{action:'edit',request:new Request('https://ekodi.kr/'),env:{},itemId:3});
  assert.deepEqual(await edit.json(),{name:'edit',id:3});
  assert.ok(boardAdapterCapabilities(board).includes('attachments'));
});
