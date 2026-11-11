import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const homes=[
 ['social/index.html','social/styles.css','social-network','EKODI','SOCIAL'],
 ['community/index.html','community/styles.css','community-koinonia','COMMUNITY','Discover'],
 ['business/index.html','business/styles.css','business-operations','BUSINESS OS','workspaceSelect'],
 ['delivery/index.html','delivery/styles.css','delivery-routes','DELIVERY HUB','storeResolver'],
 ['journal/index.html','journal/styles.css','journal-record','The EKODI Journal','journal-search'],
 ['sites/ekodi-cafe/index.html',null,'cafe-harbor','EKODI CAFE','아직 문을 열지 않은']
];
test('six independently operated first-party homepages have site-scoped CI with intact identity and core controls',()=>{
 for(const [p,css,marker,name,control] of homes){
  const html=read(p);
  assert.ok(html.includes('data-site-ci="'+marker+'"'),p);
  assert.ok(html.includes('<svg '),p);
  assert.ok(html.includes('aria-hidden="true"'),p);
  assert.ok(html.includes(name),p);
  assert.ok(html.includes(control),p);
  assert.doesNotMatch(html,/EKODI®|상표등록 완료/,p);
  const styles=css?read(css):html;
  assert.ok(styles.includes(marker),p+' scoped style');
 }
});
test('site CI does not relocate sensitive identity or transactions',()=>{
 assert.match(read('business/index.html'),/id="workspaceSelect"/);
 assert.match(read('business/index.html'),/id="authLink"/);
 assert.match(read('delivery/index.html'),/id="ekodiAccount"/);
 assert.match(read('journal/index.html'),/journal-filters/);
 assert.match(read('social/index.html'),/id="workspaceSwitch"/);
 assert.match(read('sites/ekodi-cafe/index.html'),/아직 문을 열지 않은 카페/);
});
