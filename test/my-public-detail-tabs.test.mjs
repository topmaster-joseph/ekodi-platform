import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('my/index.html');
const app=read('my/app.js');
const css=read('my/hub-shell.css');
const tabs=['profile','identity','sharing','inbox'];

test('public and digital card settings have four accessible task tabs without duplicate forms',()=>{
 for(const tab of tabs)assert.match(html,new RegExp('data-public-tab="'+tab+'"'));
 assert.equal((html.match(/data-public-tab=/g)||[]).length,4);
 for(const marker of ['role="tablist"','aria-controls="publicPanelProfile"','aria-controls="publicPanelCard"','aria-controls="publicPanelInbox"','data-public-panel="profile"','data-public-panel="card"','data-public-panel="inbox"','data-public-card-pane="identity"','data-public-card-pane="sharing"'])assert.ok(html.includes(marker),marker);
 for(const id of ['publicProfileForm','digitalCardForm','digitalCardPhone','digitalCardEmail','digitalCardExchangeEnabled','digitalCardMessengers','digitalCardRoles','digitalCardContexts','digitalCardSave','contactExchangeInbox'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/data-public-card-pane="sharing" hidden/);
 assert.match(html,/data-public-panel="card"[^>]*hidden/);
 assert.match(html,/data-public-panel="inbox"[^>]*hidden/);
 assert.match(app,/initPublicDetailTabs\(\);/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(html,/my\/app\.js\?v=20261102-public-detail-tabs-v1/);
});

function buildFixture(){
 const domNodes=Object.create(null);
 const el=dataset=>({dataset,hidden:false,tabIndex:-1,attributes:{},handlers:{},
  classList:{toggle(){}},
  setAttribute(k,v){this.attributes[k]=v;},
  addEventListener(k,fn){this.handlers[k]=fn;},
  focus(){this.focused=true;}
 });
 const tabButtons=tabs.map(publicTab=>el({publicTab}));
 const panes=[el({publicPanel:'profile'}),el({publicPanel:'card'}),el({publicPanel:'inbox'})];
 const cardPanes=[el({publicCardPane:'identity'}),el({publicCardPane:'sharing'})];
 const card=panes[1];
 const document={
  querySelectorAll(selector){
   return {'[data-public-tab]':tabButtons,'[data-public-panel]':panes,'[data-public-card-pane]':cardPanes}[selector]||[];
  },
  querySelector(selector){
   if(selector==='[data-public-panel="card"]')return card;
   const match=selector.match(/^\[data-public-tab="(\w+)"\]$/);
   return match?tabButtons[tabs.indexOf(match[1])]:null;
  }
 };
 const store=new Map();
 const sessionStorage={getItem:key=>store.get(key)||null,setItem:(key,val)=>store.set(key,val)};
 const start=app.indexOf('const PUBLIC_DETAIL_TABS=');
 const end=app.indexOf('function syncAccountTabs(){',start);
 assert.ok(start>0&&end>start);
 const code='let activeAccountTab="public";\n'+app.slice(start,end)+
  '\nthis.api={initPublicDetailTabs,setPublicDetailTab,syncPublicDetailTabs,setOuter:tab=>{activeAccountTab=tab;syncPublicDetailTabs()}}';
 const context={document,sessionStorage};
 runInNewContext(code,context);
 return {api:context.api,tabButtons,panes,cardPanes,card,store};
}

test('one visible pane per task and sharing does not discard identity form',()=>{
 const f=buildFixture();
 f.api.initPublicDetailTabs();
 assert.deepEqual(f.panes.map(x=>x.hidden),[false,true,true]);
 f.tabButtons[1].handlers.click();
 assert.deepEqual(f.panes.map(x=>x.hidden),[true,false,true]);
 assert.deepEqual(f.cardPanes.map(x=>x.hidden),[false,true]);
 assert.equal(f.tabButtons[1].attributes['aria-selected'],'true');
 f.tabButtons[2].handlers.click();
 assert.deepEqual(f.panes.map(x=>x.hidden),[true,false,true]);
 assert.deepEqual(f.cardPanes.map(x=>x.hidden),[true,false]);
 assert.equal(f.card.attributes['aria-labelledby'],'publicTabSharing');
 assert.equal(f.store.get('ekodi_my_public_detail_tab'),'sharing');
 f.tabButtons[3].handlers.click();
 assert.deepEqual(f.panes.map(x=>x.hidden),[true,true,false]);
 f.api.setOuter('basic');
 assert.deepEqual(f.panes.map(x=>x.hidden),[true,true,true]);
 f.api.setOuter('public');
 assert.deepEqual(f.panes.map(x=>x.hidden),[true,true,false]);
});

test('detail tab keyboard navigation supports arrows and home/end',()=>{
 const f=buildFixture();
 f.api.initPublicDetailTabs();
 let prevented=false;
 f.tabButtons[0].handlers.keydown({key:'ArrowLeft',preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.equal(f.tabButtons[3].attributes['aria-selected'],'true');
 assert.equal(f.tabButtons[3].focused,true);
 f.tabButtons[3].handlers.keydown({key:'Home',preventDefault(){}});
 assert.equal(f.tabButtons[0].attributes['aria-selected'],'true');
 f.tabButtons[0].handlers.keydown({key:'End',preventDefault(){}});
 assert.equal(f.tabButtons[3].attributes['aria-selected'],'true');
});

test('account choices stay two-column and readable below 460px',()=>{
 const smallScreen=css.slice(css.indexOf('@media(max-width:460px){'));
 assert.match(smallScreen,/#account \.account-wayfinder-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(smallScreen,/#account \.account-wayfinder-grid button>strong\{font-size:12px;line-height:1\.35;word-break:keep-all/);
 assert.match(smallScreen,/#account \.account-wayfinder-grid button>small\{display:none\}/);
 assert.match(css,/@media\(max-width:720px\)[\s\S]*?\.public-detail-tabs\{width:calc\(100% - 24px\)/);
});

test('compact account stylesheet uses a new immutable asset version',()=>{
 assert.match(html,/hub-shell\.css\?v=20261102-mobile-compact-v1/);
});
