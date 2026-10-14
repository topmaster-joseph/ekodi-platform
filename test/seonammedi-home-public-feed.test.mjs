import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../sites/seonammedi/public/home-public-feed.js',import.meta.url),'utf8');
const css=await readFile(new URL('../sites/seonammedi/public/home-public-feed.css',import.meta.url),'utf8');
test('SeonamMedi landing preview uses real timeline and board sources with four ordered sections',async()=>{
 const root={hidden:true,innerHTML:''};
 const fixture={
  '/api/seonammedi/notices':{ok:true,items:[{id:4,title:'공식 공지',publishedAt:'2026-10-13',status:'published'}]},
  '/board/api/posts':{ok:true,items:[{id:5,message:'시민의견 공개 글',createdAt:'2026-10-12',status:'published'},{id:7,message:'비공개 글',visibility:'private'}]},
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
 for(const title of ['공식 공지','비대위 기자회견','방송 관련소식','시민의견 공개 글'])assert.ok(markup.includes(title),title);
 for(const title of ['비공개 글','검토중 기사'])assert.ok(!markup.includes(title),title);
 assert.match(markup,/href="\/board\/voices"/);
});
test('landing-only preview is hidden while a central category is selected',()=>assert.match(css,/\.hero\[hidden\]\s*~\s*#homePublicFeed/));
