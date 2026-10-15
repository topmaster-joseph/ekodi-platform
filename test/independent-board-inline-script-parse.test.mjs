import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

const roots=['https://seonammedi.kr','https://ekodi.kr/seonammedi'];
const routes=['notices','voices','finance'];

test('published independent-board inline JavaScript parses on both site mounts and slash variants',async()=>{
  for(const root of roots)for(const route of routes)for(const slash of ['','/']){
    const url=root+'/board/'+route+slash;
    const response=await board.fetch(new Request(url),{});
    assert.equal(response.status,200,url);
    const html=await response.text();
    if(route==='notices')assert.ok(html.includes('id="list"'),'public notice list mount missing: '+url);
    const blocks=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
    if(route!=='finance')assert.ok(blocks.length,'must render live '+route+' behavior on '+url);
    for(let i=0;i<blocks.length;i++){
      try{new Script(blocks[i],{filename:route+'-'+(root.includes('ekodi.kr')?'internal':'customer')+'-'+i+'.js'});}
      catch(error){assert.fail(url+' inline script '+i+' invalid: '+String(error.stack||error).slice(0,1300));}
    }
  }
});
