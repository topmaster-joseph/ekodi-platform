import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [auth,router,app]=await Promise.all([
 read('../auth-site/client-auth.js'),
 read('../auth-site/auth-router.js'),
 read('../sites/ekodi-singles/public/app.js')
]);
test('EKODI Singles is a first-party centralized auth realm and same-apex return',()=>{
 assert.match(auth,/singles:\{name:'EKODI 동행',returnTo:'https:\/\/ekodi\.kr\/singles\/'/);
 assert.match(auth,/origins:\['https:\/\/ekodi\.kr'\]/);
 assert.match(router,/firstPartyClientSites=new Set\(\[[^\]]*'singles'/);
 assert.match(app,/u\.searchParams\.set\('site','singles'\)/);
 assert.match(app,/u\.searchParams\.set\('return_to','https:\/\/ekodi\.kr\/singles'/);
});
test('login URL is a fixed same-origin destination, not an arbitrary caller-controlled URL',()=>{
 assert.doesNotMatch(app,/u\.searchParams\.set\('return_to',\s*location\.href/);
 assert.doesNotMatch(app,/searchParams\.set\(['"]ekodi_token/);
 assert.match(app,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/);
});
