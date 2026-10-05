import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardAdapter} from '../common-board-adapter.js';
import {createReplaceableBoard} from '../replaceable-board-provider.js';

const make=()=>new Response('{}',{headers:{'content-type':'application/json'}});
const adapter=createBoardAdapter({boardId:'provider.test',list:make,create:make});

test('missing external client is recorded as EKODI native degraded routing',()=>{
  const result=createReplaceableBoard({adapter,preferredEngine:'nodebb'});
  assert.equal(result.engineId,'ekodi-native');
  assert.equal(result.requestedEngineId,'nodebb');
  assert.equal(result.degraded,true);
  assert.match(result.fallbackReason,/board_engine_client_required/);
  assert.equal(result.board,adapter);
});

test('healthy external client is used when selected',()=>{
  const engineClient={createBoard:value=>({wrapped:value})};
  const result=createReplaceableBoard({adapter,preferredEngine:'nodebb',engineClient});
  assert.equal(result.engineId,'nodebb');
  assert.equal(result.degraded,false);
  assert.equal(result.board.wrapped,adapter);
});
