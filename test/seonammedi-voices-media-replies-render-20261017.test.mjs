import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

test('public and internal mounts actually render the existing reply and image card fragments',async()=>{
  for(const href of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
    const response=await board.fetch(new Request(href),{});
    assert.equal(response.status,200);
    const html=await response.text();
    const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
    assert.equal(script.length,1);
    assert.doesNotThrow(()=>new Script(script[0]));
    assert.match(script[0],/const replies=\(x\.replies\|\|\[\]\)\.filter/);
    assert.match(script[0],/const media=\(x\.imageUrls\|\|\[\]\)\.map/);
    assert.match(script[0],/\+'<\/p>'\+media\+replies\+'<div class="admin-actions">/);
    assert.match(script[0],/esc\(r\.message\|\|""\)/);
    assert.match(script[0],/isAdmin\?'<button class="secondary" type="button" data-post=/);
    assert.match(script[0],/data-reply-delete/);
  }
});
