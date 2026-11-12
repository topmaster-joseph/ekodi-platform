import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('first-party EKODI identity is explicitly governed and protected from old prefix-free rewrites',()=>{
 const normalizer=read('scripts/normalize-platform-ai-names.mjs');
 for(const forbidden of ["['에코디출판', '출판']","['에코디커뮤니티', '커뮤니티']","['EKODI Publishing', 'Publishing']"])
   assert.ok(!normalizer.includes(forbidden),forbidden+' must not suppress official identity');
 assert.match(normalizer,/officialFirstParty=Object\.freeze/);
 assert.match(normalizer,/publishing:'에코디출판'/);
 assert.match(normalizer,/management:'에코디경영'/);
 assert.match(normalizer,/community:'에코디커뮤니티'/);
 assert.match(read('admin-lazy-features.js'),/domain:'publishing\.ekodi\.kr'[^\n]*name:'에코디출판'/);
 assert.match(read('admin-lazy-features.js'),/domain:'management\.ekodi\.kr'[^\n]*name:'에코디경영'/);
});
test('auth labels and social release validity follow official name but preserve routes, auth protection',()=>{
 const auth=read('auth-site/client-auth.js');
 assert.match(auth,/publishing:\{name:'에코디출판',returnTo:'https:\/\/ekodi\.kr\/publishing\/'/);
 assert.match(auth,/management:\{name:'에코디경영',returnTo:'https:\/\/ekodi\.kr\/management\/'/);
 assert.match(read('.github/workflows/social-release-gate.yml'),/c\.name!=='에코디커뮤니티'/);
 const registry=JSON.parse(read('config/ecosystem-services.json'));
 const get=id=>registry.services.find(x=>x.id===id);
 for(const [id,name] of [['community','에코디커뮤니티'],['management','에코디경영'],['publishing','에코디출판']])assert.equal(get(id).name,name);
 assert.equal(get('management').status,'preparing');
 assert.equal(get('publishing').status,'live');
 assert.ok(!registry.services.some(x=>['bbqcg','cgma'].includes(x.id)));
});
