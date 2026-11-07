import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CHURCH_ADMIN_MENU,mountChurchAdminNavigation,CHURCH_ADMIN_NAV_CSS} from '../church-admin-navigation.js';
import {churchPastorAdminPage,churchPastorAdminScript} from '../church-pastor-admin-page.js';
import {workspaceAdminCss,workspaceAdminScript} from '../workspace-admin-page.js';

function node(){
  return {
    children:[],dataset:{},attributes:{},hidden:false,textContent:'',className:'',
    classList:{items:new Set(),add(name){this.items.add(name)},contains(name){return this.items.has(name)}},
    setAttribute(key,value){this.attributes[key]=value},
    append(...children){this.children.push(...children)},
    replaceChildren(...children){this.children=children}
  };
}
test('single church navigation registry owns all common and dedicated routes exactly once',()=>{
  const seen=new Set();
  assert.deepEqual([...new Set(CHURCH_ADMIN_MENU.map(group=>group.scope))],['common','dedicated']);
  for(const group of CHURCH_ADMIN_MENU){
    assert.ok(group.tabs.length>0,group.id);
    for(const tab of group.tabs){
      assert.ok(!seen.has(tab.key),'duplicate route: '+tab.key);
      seen.add(tab.key);
      assert.ok(['church','workspace'].includes(tab.owner));
      assert.match(tab.capability,/^[a-zA-Z]+$/);
    }
  }
  for(const key of ['services','publishing','confirmations','members','status','records','worship','care','calendar','offerings','banking','accounting','receipts','reports','ai','access','chrome']){
    assert.ok(seen.has(key),'missing observed admin route: '+key);
  }
  const service=CHURCH_ADMIN_MENU.find(group=>group.id==='services');
  assert.equal(service.scope,'common');
  assert.deepEqual(service.tabs.map(item=>item.key),['services']);
});
test('church top tabs link to original owner paths and keep the active page visible',()=>{
  const root=node(),tabsRoot=node();
  const original=globalThis.document;
  globalThis.document={createElement:()=>node()};
  try{
    mountChurchAdminNavigation({root,tabsRoot,groups:CHURCH_ADMIN_MENU,
      activeKey:'care',activeOwner:'church',canView:()=>true});
    const headings=root.children.filter(item=>item.className==='church-admin-nav-heading');
    assert.deepEqual(headings.map(item=>item.textContent),['공통메뉴','전용메뉴']);
    assert.equal(headings[0].attributes['role'],'heading');
    assert.equal(headings[0].attributes['aria-level'],'2');
    assert.equal(root.children[1].dataset.adminNavGroup,'services','service settings must be first inside common menu');
    assert.equal(root.children.filter(item=>item.dataset.adminNavGroup==='services').length,1);
    const dedicatedIndex=root.children.indexOf(headings[1]);
    assert.ok(dedicatedIndex>1);
    assert.ok(root.children.slice(1,dedicatedIndex).every(item=>CHURCH_ADMIN_MENU.find(group=>group.id===item.dataset.adminNavGroup)?.scope==='common'));
    assert.ok(root.children.slice(dedicatedIndex+1).every(item=>CHURCH_ADMIN_MENU.find(group=>group.id===item.dataset.adminNavGroup)?.scope==='dedicated'));
    const links=root.children.filter(item=>item.href);
    assert.equal(links.find(item=>item.dataset.adminNavGroup==='people').href,'/ekodichurch/admin/care');
    assert.equal(links.filter(item=>item.dataset.adminNavGroup==='people').length,1);
    assert.equal(tabsRoot.hidden,false);
    assert.deepEqual(tabsRoot.children.map(item=>item.dataset.adminDetail),['people','attendance','care']);
    assert.equal(tabsRoot.children.find(item=>item.dataset.adminDetail==='care').attributes['aria-current'],'page');
    assert.equal(tabsRoot.children.find(item=>item.dataset.adminDetail==='attendance').href,'/ekodichurch/admin/attendance');
    mountChurchAdminNavigation({root,tabsRoot,groups:CHURCH_ADMIN_MENU,
      activeKey:'services',activeOwner:'workspace',canView:()=>true});
    assert.equal(tabsRoot.hidden,true,'single-action group should not waste space on tabs');
    assert.equal(root.children.filter(item=>item.dataset.adminNavGroup==='services').length,1);
    assert.equal(root.children.find(item=>item.dataset.adminNavGroup==='services').href,'/ekodichurch/admin/services');
  }finally{globalThis.document=original}
});
test('role filtering never includes forbidden destinations or constructs a misleading tab',()=>{
  const root=node(),tabsRoot=node(),original=globalThis.document;
  globalThis.document={createElement:()=>node()};
  try{
    mountChurchAdminNavigation({root,tabsRoot,groups:CHURCH_ADMIN_MENU,
      activeKey:'worship',activeOwner:'church',canView:tab=>tab.key==='worship'});
    assert.deepEqual(root.children.filter(item=>item.href).map(item=>item.href),['/ekodichurch/admin/worship']);
    assert.deepEqual(root.children.filter(item=>item.className==='church-admin-nav-heading').map(item=>item.textContent),['전용메뉴'],'restricted roles must not see an empty Common Menu');
    assert.equal(tabsRoot.children.length,0);
    assert.equal(tabsRoot.hidden,true);
  }finally{globalThis.document=original}
});
test('both existing admin runtimes project the same registry without changing ownership',async()=>{
  const [churchHtml,churchJs,workspaceJs,workspaceCss]=await Promise.all([
    churchPastorAdminPage().text(),churchPastorAdminScript().text(),workspaceAdminScript().text(),workspaceAdminCss().text()
  ]);
  assert.match(churchHtml,/id="sectionNav" class="church-admin-detail-tabs"/);
  assert.match(churchJs,/mountChurchAdminNavigation/);
  assert.match(workspaceJs,/mountChurchAdminNavigation/);
  assert.match(workspaceJs,/workspace==='ekodichurch'&&!service/);
  assert.match(workspaceJs,/!serviceMenuVisible\(tab\.key\)/);
  assert.match(workspaceJs,/settings\.dataset\.adminSection='services'/);
  assert.doesNotMatch(workspaceJs,/id:'service-config'/);
  assert.match(workspaceJs,/viewTabs\.after\(tabs\)/);
  // Church admin removed the work/metrics view tabs: no repositioning, no reload-per-click navigation.
  assert.doesNotMatch(churchJs,/viewTabs\.after\(details\)/);
  assert.match(churchJs,/history\.pushState\(\{churchAdminSection:next\}/);
  assert.match(workspaceJs,/showUnavailable:Boolean\(role\)/);
  assert.match(churchJs,/showUnavailable:Boolean\(role\)/);
  assert.match(workspaceCss,/church-admin-detail-tabs/);
  assert.ok(CHURCH_ADMIN_NAV_CSS.includes('word-break:keep-all'));
  assert.ok(CHURCH_ADMIN_NAV_CSS.includes('@media(max-width:620px)'));
  assert.doesNotThrow(()=>new vm.Script(churchJs));
  assert.doesNotThrow(()=>new vm.Script(workspaceJs));
});

test('same Church menu outline appears on all seven admin pages regardless of route owner',()=>{
  const original=globalThis.document;globalThis.document={createElement:()=>node()};
  const expected=[...CHURCH_ADMIN_MENU.filter(group=>group.id==='services'),...CHURCH_ADMIN_MENU.filter(group=>group.id!=='services')].map(group=>group.label);
  try{
    const routes=[
      ['overview','church'],['people','church'],['worship','church'],
      ['offerings','church'],['ai','church'],['chrome','church'],
      ['services','workspace'],['records','workspace']
    ];
    for(const [activeKey,activeOwner] of routes){
      const root=node(),tabsRoot=node();
      mountChurchAdminNavigation({
        root,tabsRoot,groups:CHURCH_ADMIN_MENU,activeKey,activeOwner,
        canView:()=>true,showUnavailable:true
      });
      const labels=root.children.filter(item=>item.dataset.adminNavGroup).map(item=>item.textContent);
      assert.deepEqual(labels,expected,'different Church admin sidebar on '+activeKey);
      const selected=root.children.filter(item=>item.classList.contains('active'));
      assert.equal(selected.length,1,activeKey+' must have one active left menu');
      assert.equal(selected[0].attributes['aria-current'],'location');
      if(['people','worship','offerings','chrome'].includes(activeKey))
        assert.equal(tabsRoot.hidden,false,'multi-action group must show contextual tabs');
    }
  }finally{globalThis.document=original;}
});

test('capability-limited church administrators see stable inert labels but no forbidden URLs or clickable links',()=>{
  const original=globalThis.document;globalThis.document={createElement:()=>node()};
  try{
    const root=node(),tabsRoot=node();
    mountChurchAdminNavigation({
      root,tabsRoot,groups:CHURCH_ADMIN_MENU,activeKey:'worship',activeOwner:'church',
      canView:tab=>tab.key==='worship',showUnavailable:true
    });
    const all=root.children.filter(item=>item.dataset.adminNavGroup);
    assert.deepEqual(all.map(item=>item.textContent),[...CHURCH_ADMIN_MENU.filter(group=>group.id==='services'),...CHURCH_ADMIN_MENU.filter(group=>group.id!=='services')].map(group=>group.label));
    const linked=all.filter(item=>item.href);
    assert.deepEqual(linked.map(item=>item.href),['/ekodichurch/admin/worship']);
    for(const item of all.filter(item=>!item.href)){
      assert.equal(item.tagName,undefined); // inert span in the DOM adapter
      assert.equal(item.attributes['aria-disabled'],'true');
      assert.equal(item.classList.contains('church-admin-nav-unavailable'),true);
    }
    assert.deepEqual(root.children.filter(item=>item.className==='church-admin-nav-heading').map(item=>item.textContent),['공통메뉴','전용메뉴']);
    assert.equal(tabsRoot.hidden,true,'limited worship role must not get hidden side routes');
  }finally{globalThis.document=original;}
});

test('Church layout is compact, semantic and scoped to the Church tenant only',async()=>{
  const [churchHtml,workspaceHtml,css,pastorJs,workspaceJs]=await Promise.all([
    churchPastorAdminPage().text(),
    (await import('../workspace-admin-page.js')).workspaceAdminPage('/ekodichurch/admin/services').text(),
    Promise.resolve(CHURCH_ADMIN_NAV_CSS),
    churchPastorAdminScript().text(),
    workspaceAdminScript().text()
  ]);
  assert.match(churchHtml,/id="pageTitle"/,'H1 remains available to assistive technology');
  assert.match(workspaceHtml,/id="pageTitle"/);
  assert.match(css,/html\[data-ekodi-church-unified-admin="true"\] \.layout main > \.heading/);
  assert.match(css,/clip-path:inset\(50%\)!important/);
  assert.match(css,/justify-content:flex-start!important/);
  assert.match(css,/padding:10px clamp\(12px,2\.2vw,28px\) 22px/);
  assert.match(css,/\.church-admin-nav-unavailable\[aria-disabled="true"\]/);
  assert.doesNotMatch(pastorJs,/viewTabs\.after\(details\)/);
  assert.match(workspaceJs,/viewTabs\.after\(tabs\)/);
  assert.match(css,/@media\(max-width:620px\)/,'small screen touch sizing preserved');
});
