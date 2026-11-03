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
    assert.equal(headings.length,0,'site administrator sees one task menu without scope headings');
    assert.equal(root.children[0].dataset.adminNavGroup,'services','service settings must lead the menu');
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
  assert.match(workspaceJs,/heading\.after\(tabs\)/);
  assert.match(workspaceCss,/church-admin-detail-tabs/);
  assert.ok(CHURCH_ADMIN_NAV_CSS.includes('word-break:keep-all'));
  assert.ok(CHURCH_ADMIN_NAV_CSS.includes('@media(max-width:620px)'));
  assert.doesNotThrow(()=>new vm.Script(churchJs));
  assert.doesNotThrow(()=>new vm.Script(workspaceJs));
});
