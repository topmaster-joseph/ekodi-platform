import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../admin-central-handoff.js',import.meta.url),'utf8');
const handoff=src.split('\n').find(line=>line.startsWith('function acceptCentralHandoff()'));
function exercise({storageFails=false}={}){
  let saved='',replaced=false;
  const location={hash:'#ekodi_admin_token=sampleSession123',search:'',pathname:'/admin/services/engine-all'};
  const storage={setItem(_k,v){if(storageFails)throw new Error('denied');saved=v;},getItem(){return saved;}};
  const context={location,sessionStorage:storage,URLSearchParams,
    routes:()=>({sectionFromPath:()=> 'engine-all'}),
    normalizeRoute:v=>v,cleanRouteUrl:()=>'/admin/services/engine-all',
    safeSession:{get:()=>saved,set:()=>{},remove:()=>{}},
    history:{replaceState(){replaced=true;}},document:{title:'Admin'},mark:()=>{}};
  const accepted=vm.runInNewContext(handoff+';acceptCentralHandoff()',context);
  return {accepted,saved,replaced};
}
test('stored admin token is accepted and the fragment is cleared',()=>{
  assert.deepEqual(exercise(),{accepted:true,saved:'sampleSession123',replaced:true});
});
test('blocked browser session storage never erases an unpersisted handoff token',()=>{
  assert.deepEqual(exercise({storageFails:true}),{accepted:false,saved:'',replaced:false});
});
test('API session result must attest authenticated login',()=>{
  assert.ok(src.includes('result.authenticated!==true'));
});
