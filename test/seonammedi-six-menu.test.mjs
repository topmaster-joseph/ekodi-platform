import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const expected=['공지','활동이력','관련소식','소통채널','시민의견','조직'];
const html=path=>readFile(new URL('../sites/seonammedi/public/'+path,import.meta.url),'utf8');
function primaryMenu(htmlText){
  const nav=htmlText.match(/<nav class="ekodi-six-nav" aria-label="주요 메뉴">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav,'six-menu navigation is present');
  const withoutSubmenus=nav.replace(/<div class="nav-submenu">[\s\S]*?<\/div>/g,'');
  return [...withoutSubmenus.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(m=>m[1]);
}
function assertMenu(htmlText){
  assert.deepEqual(primaryMenu(htmlText),expected);
  assert.match(htmlText,/공지사항<\/a>/);
  assert.ok(!primaryMenu(htmlText).includes('회계'),'accounting must be nested under notice');
  assert.match(htmlText,/페이스북<\/a>/);
  assert.match(htmlText,/인스타그램<\/a>/);
  assert.match(htmlText,/유튜브<\/a>/);
  assert.match(htmlText,/신문·인터넷 언론<\/a>/);
  assert.match(htmlText,/방송<\/a>/);
}
test('main and standalone public notice/finance headers share the exact six-menu hierarchy',async()=>{
  for(const name of ['index.html','notices/index.html','finance/index.html'])assertMenu(await html(name));
});
test('independent board routes share the same menu on canonical and mounted domains',async()=>{
  for(const origin of ['https://seonammedi.kr/board','https://ekodi.kr/seonammedi/board']){
    for(const route of ['voices','notices','finance']){
      const response=await board.fetch(new Request(origin+'/'+route),{});
      assert.equal(response.status,200,origin+'/'+route);
      assertMenu(await response.text());
    }
  }
});
test('main site menu supports direct news source and channel deep links without exposing internal minutes',async()=>{
  const page=await html('index.html');
  const app=await html('app.js');
  for(const link of ['#timeline/%EC%8B%A0%EB%AC%B8','#timeline/%EB%B0%A9%EC%86%A1','#channels/facebook','#channels/instagram','#channels/youtube']){
    assert.ok(page.includes('href="'+link+'"'),'missing submenu link '+link);
  }
  for(const marker of ['data-view-link="committee"','data-view-link="status"','data-view-link="channels"','data-view-link="organization"']){
    assert.ok(page.includes(marker),'missing routed main navigation '+marker);
  }
  assert.match(app,/categoryFromMenuHash\('timeline',TIMELINE_FILTERS\)/);
  assert.match(app,/showStatusTab\('timeline'\)/);
  assert.doesNotMatch(page,/href="minutes\/"/);
  const minutes=await html('minutes/index.html');
  assert.match(minutes,/내부 회의록 확인/);
  assert.match(minutes,/name="name"/);
});
