import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../sites/seonammedi/public/home-public-feed.js',import.meta.url),'utf8');
const css=await readFile(new URL('../sites/seonammedi/public/home-public-feed.css',import.meta.url),'utf8');
test('SeonamMedi landing preview uses real timeline and board sources with four ordered sections',async()=>{
 const root={hidden:true,innerHTML:''};
 const fixture={
  '/api/seonammedi/notices':{ok:true,items:[{id:8,title:'기존 공지',publishedAt:'2026-10-01',status:'published'}]},
  '/board/api/notices':{ok:true,items:[{id:4,title:'공식 공지',createdAt:'2026-10-13',status:'published'},{id:3,title:'이전 공지',createdAt:'2026-10-11',status:'published'}]},
  '/board/api/posts':{ok:false,error:'legacy_citizen_board_retired'},
  '/board/api/voices-fresh':{ok:true,items:[{id:5,message:'시민의견 공개 글',createdAt:'2026-10-12'},{id:7,message:'비공개 글',visibility:'private'}]},
  '/api/seonammedi/timeline':{items:[
   {title:'비대위 기자회견',date:'2026.10.11',recordScope:'committee',status:'published'},
   {title:'방송 관련소식',date:'2026.10.10',category:'방송',status:'published'},
   {title:'검토중 기사',date:'2026.10.15',status:'draft'}
  ]},
  '/seonammedi/data.json':{timeline:[]}
 };
 const fetch=async path=>({ok:true,json:async()=>fixture[path]});
 vm.runInNewContext(source,{document:{getElementById:id=>id==='homePublicFeed'?root:null},location:{hostname:'seonammedi.kr'},fetch,Date,Promise,encodeURIComponent});
 await new Promise(resolve=>setImmediate(resolve));
 const markup=root.innerHTML;
 assert.equal(root.hidden,false);
 const order=['공지사항','활동이력','관련소식','시민의견'].map(label=>markup.indexOf('<h2>'+label+'</h2>'));
 assert.ok(order.every(n=>n>=0),'four headings must be present');
 assert.deepEqual(order,[...order].sort((a,b)=>a-b),'headings must be in the required order');
 for(const title of ['공식 공지','이전 공지','비대위 기자회견','방송 관련소식','시민의견 공개 글'])assert.ok(markup.includes(title),title);
 // 2026-10-20 owner decision: calendar events (Site Core notices) never appear in the home 공지사항 list.
 for(const title of ['비공개 글','검토중 기사','기존 공지'])assert.ok(!markup.includes(title),title);
 assert.doesNotMatch(markup,/href="\/notices\//);
 assert.match(markup,/href="\/board\/voices"/);
 assert.match(markup,/href="\/board\/notices\?id=4"/);
 assert.ok(markup.indexOf("공식 공지")<markup.indexOf("이전 공지"),"notices must be chronological");
});
test('landing-only preview is hidden while a central category is selected',()=>assert.match(css,/\.hero\[hidden\]\s*~\s*#homePublicFeed/));

test('EKODI path mount uses site-scoped independent board APIs and links',async()=>{
 const root={hidden:true,innerHTML:''};
 const requested=[];
 const fetch=async path=>{
  requested.push(path);
  const items=path==='/seonammedi/board/api/notices'?[{id:4,title:'실제 공지',createdAt:'2026-10-08',status:'published'}]:[];
  return {ok:true,json:async()=>({ok:true,items})};
 };
 vm.runInNewContext(source,{document:{getElementById:id=>id==='homePublicFeed'?root:null},location:{hostname:'ekodi.kr'},fetch,Date,Promise,encodeURIComponent});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(requested.includes('/seonammedi/board/api/notices'));
 assert.ok(requested.includes('/seonammedi/board/api/voices-fresh')&&!requested.includes('/seonammedi/board/api/posts'));
 assert.match(root.innerHTML,/실제 공지/);
 assert.match(root.innerHTML,/href="\/seonammedi\/board\/notices\?id=4"/);
});

test('home 공지사항 rows open the board (top 공지 menu screen), 중요 first, events excluded',async()=>{
 const root={hidden:true,innerHTML:''};const requested=[];
 const data={'/seonammedi/board/api/notices':[{id:21,title:'일반 최신',createdAt:'2026-10-20T01:30:00Z'},{id:19,title:'중요 공지',pinned:true,createdAt:'2026-10-19T21:00:00Z'}]};
 const fetch=async path=>{requested.push(path);return {ok:true,json:async()=>({ok:true,items:path==='/api/seonammedi/notices'?[{id:11,title:'특별시 국정감사 및 제8차 시민대회',kind:'event'}]:(data[path]||[])})}};
 vm.runInNewContext(source,{document:{getElementById:id=>id==='homePublicFeed'?root:null},location:{hostname:'ekodi.kr'},fetch,Date,Promise,encodeURIComponent});
 await new Promise(resolve=>setImmediate(resolve));
 const m=root.innerHTML;
 assert.ok(!requested.includes('/api/seonammedi/notices'),'events API is not read for the notice list');
 assert.ok(!m.includes('특별시 국정감사'),'calendar events are not listed as notices');
 assert.ok(m.indexOf('중요 공지')<m.indexOf('일반 최신'),'중요 first, like the board');
 assert.match(m,/href="\/seonammedi\/board\/notices\?id=19"/);
});
