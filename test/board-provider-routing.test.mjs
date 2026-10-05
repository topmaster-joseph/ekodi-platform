import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardAdapter} from '../common-board-adapter.js';
import {createReplaceableBoard} from '../replaceable-board-provider.js';

const make=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

function adapter(){
  return createBoardAdapter({
    boardId:'provider.test',
    list:()=>make({source:'ekodi',operation:'list'}),
    search:()=>make({source:'ekodi',operation:'search'}),
    create:()=>make({source:'ekodi',operation:'create'})
  });
}

test('missing external client degrades to EKODI native without affecting core board',async()=>{
  const core=adapter();
  const result=createReplaceableBoard({adapter:core,preferredEngine:'nodebb'});
  assert.equal(result.engineId,'ekodi-native');
  assert.equal(result.coreEngineId,'ekodi-native');
  assert.equal(result.requestedEngineId,'nodebb');
  assert.equal(result.degraded,true);
  assert.equal(result.aiIndependent,true);
  assert.match(result.fallbackReason,/board_engine_client_required/);
  assert.equal((await result.board.list()).status,200);
  assert.deepEqual(await (await result.board.search()).json(),{source:'ekodi',operation:'search'});
});

test('healthy external engine is attached only as an optional extension',async()=>{
  const core=adapter();
  const extension={name:'nodebb-extension',list:()=>{throw new Error('must_not_intercept_core')}};
  const engineClient={createBoard:value=>({...extension,wrapped:value})};
  const result=createReplaceableBoard({adapter:core,preferredEngine:'nodebb',engineClient});
  assert.equal(result.engineId,'nodebb');
  assert.equal(result.extensionEngineId,'nodebb');
  assert.equal(result.degraded,false);
  assert.equal(result.extensionBoard.wrapped,core);
  assert.equal(result.board.extension,result.extensionBoard);
  assert.deepEqual(await (await result.board.list()).json(),{source:'ekodi',operation:'list'});
  assert.deepEqual(await (await result.board.create()).json(),{source:'ekodi',operation:'create'});
});

test('external engine cannot replace canonical CRUD handlers',async()=>{
  const core=adapter();
  let intercepted=0;
  const engineClient={createBoard:()=>({
    list:()=>{intercepted+=1;throw new Error('external list called')},
    create:()=>{intercepted+=1;throw new Error('external create called')}
  })};
  const result=createReplaceableBoard({adapter:core,preferredEngine:'nodebb',engineClient});
  await result.board.list();
  await result.board.create();
  assert.equal(intercepted,0);
});
