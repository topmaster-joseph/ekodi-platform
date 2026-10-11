import test from 'node:test';
import assert from 'node:assert/strict';
import platformRouter from '../platform-router-entry-worker.js';
import {readFile} from 'node:fs/promises';

test('short legacy public aliases redirect before generic storefront fallback',async()=>{
 const aliases=[
  ['/ekodibooks','/books/'],
  ['/ekodibooks/admin','/books/admin'],
  ['/ekodibooks/catalog?page=2','/books/catalog?page=2'],
  ['/pgm','/pyeonggongmok/'],
  ['/pgm/','/pyeonggongmok/'],
  ['/pgm/admin/?tab=members','/pyeonggongmok/admin/?tab=members']
 ];
 for(const [from,target] of aliases){
  const response=await platformRouter.fetch(new Request('https://ekodi.kr'+from),{ENVIRONMENT:'production'},{});
  assert.equal(response.status,308,from);
  assert.equal(response.headers.get('location'),'https://ekodi.kr'+target,from);
  assert.equal(response.headers.get('x-ekodi-route'),'legacy-service-canonical');
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
});

test('legacy aliases never change unrelated paths or authenticated write methods',async()=>{
 const text=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
 assert.match(text,/\^\\\/\(ekodibooks\|pgm\)/);
 assert.match(text,/\['GET','HEAD'\]\.includes\(request\.method\)/);
 assert.match(text,/legacy-service-canonical/);
 assert.doesNotMatch(text,/ekodibooks.*yogurt|pgm.*yogurt/);
});
