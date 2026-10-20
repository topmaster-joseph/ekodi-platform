import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const script=await readFile(new URL('../sites/seonammedi/public/central-category-runtime.js',import.meta.url),'utf8');
const html=await readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
const labels=['공지','활동이력','관련소식','소통채널','시민의견','조직'];

function fixture(){
  const items=labels.map((label,index)=>{
    const events=new Map();
    return {
      textContent:label,
      href:index===0?'board/notices':'#test',
      dataset:{},
      attrs:{},
      setAttribute(key,value){this.attrs[key]=value;},
      removeAttribute(key){delete this.attrs[key];},
      addEventListener(type,listener){const listeners=events.get(type)||[];listeners.push(listener);events.set(type,listeners);},
      click(){
        const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
        for(const handler of events.get('click')||[])handler(event);
        return event.defaultPrevented;
      }
    };
  });
  const panel={hidden:true,scrollIntoView(){}};
  const title={textContent:''};
  const buttons={
    children:[],
    replaceChildren(){this.children=[];},
    append(child){this.children.push(child);},
    addEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return this.children;}
  };
  const social={hidden:true};
  const nodes={
    'central-category-panel':panel,
    'central-category-title':title,
    'central-category-buttons':buttons,
    'central-social-links':social
  };
  const document={
    body:{dataset:{}},
    getElementById(key){return nodes[key]||null;},
    querySelectorAll(selector){
      if(selector==='.ekodi-six-nav > a')return items;
      if(selector==='.ekodi-six-nav > a:not([data-category-menu])')return items.filter(x=>!x.dataset.categoryMenu);
      return [];
    },
    querySelector(selector){return selector==='.hero'?{hidden:false}:null;},
    createElement(){return {textContent:'',href:''};},
    addEventListener(){}
  };
  runInNewContext(script,{document,window:{addEventListener(){}},location:{hash:''}});
  return {items,panel,title};
}

test('Notice remains a native board navigation after homepage and every other main menu',()=>{
  const nav=html.slice(html.indexOf('<nav class="ekodi-six-nav"'),html.indexOf('</nav>'));
  assert.ok(nav.includes('href="board/notices" >공지</a>'));
  for(const previous of ['첫화면',...labels.slice(1)]){
    const {items,panel}=fixture();
    const selected=items.find(item=>item.textContent===previous);
    if(selected)selected.click();
    const notice=items[0];
    assert.equal(notice.dataset.categoryMenu,undefined,'Notice must never be registered as a category');
    assert.equal(notice.click(),false,'Notice click must not be prevented after '+previous);
    assert.equal(panel.hidden,true,'old central category must close after navigating to Notice');
    for(const base of ['https://seonammedi.kr/','https://ekodi.kr/seonammedi/']){
      const expected=new URL('board/notices',base);
      assert.equal(new URL(notice.href,base).href,expected.href,'correct mount after '+previous);
    }
  }
});

test('activity, news and social subcategories still open in the central panel',()=>{
  for(const name of ['활동이력','관련소식','소통채널']){
    const {items,panel,title}=fixture();
    assert.equal(items.find(item=>item.textContent===name).click(),true);
    // 2026-10-20 owner request: full titles for the two committee/news panels.
    assert.equal(title.textContent,({'활동이력':'서남권 국립의대 비상대책위원회 활동이력','관련소식':'서남권 국립의대 관련소식'})[name]||name);
    assert.equal(panel.hidden,false);
  }
});
