import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountTenantNotificationMetrics} from '../tenant-notification-admin-ui.js';
import {workspaceAdminScript} from '../workspace-admin-page.js';
import {Script} from 'node:vm';

const screen=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
test('existing site service settings mount the topic-scoped dashboard without another menu',()=>{
  assert.match(screen,/mountTenantNotificationMetrics\(\$\('mainPanel'\)/);
  assert.match(screen,/workspace==='ekodimission'\?'mission':'church'/);
  assert.match(screen,/accessToken\(\)/);
  assert.match(screen,/\/api\/notifications\/admin\/summary\?topic=/);
  assert.match(screen,/credentials:'omit'/);
});
test('the served workspace-admin.js embeds the helper and is parseable JavaScript',async()=>{
  const response=workspaceAdminScript();
  assert.equal(response.status,200);
  const source=await response.text();
  assert.match(source,/const mountTenantNotificationMetrics=/);
  assert.match(source,/function mountTenantNotificationMetrics/);
  assert.doesNotThrow(()=>new Script(source));
});
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};
    this.textContent='';this.className='';this.disabled=false;this.isConnected=true;this.events={};}
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=items}
  setAttribute(key,value){this.attributes[key]=value}
  addEventListener(key,cb){this.events[key]=cb}
}
const previousDocument=globalThis.document;
function documentFixture(){
  const head=new Element('head');
  globalThis.document={createElement:tag=>new Element(tag),querySelector:()=>null,head};
  return {head};
}
test('dashboard never renders unrecognized topics or mismatch from a server response',async()=>{
  documentFixture();
  const root=new Element('div');
  mountTenantNotificationMetrics(root,{topic:'mall',load:async()=>({ok:true,topics:[]})});
  assert.equal(root.children.length,0);
  mountTenantNotificationMetrics(root,{topic:'mission',load:async()=>({
    ok:true,topics:[{id:'church',label:'교회',subscriberDevices:50}]
  })});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.children.length,1);
  const panel=root.children[0];
  assert.equal(panel.dataset.notificationTopic,'mission');
  const status=panel.children.find(item=>item.attributes.role==='status');
  assert.match(status.textContent,/권한 또는 서버 연결/);
  assert.equal(panel.children[4].children.length,0);
});
test('authorized counter displays aggregate numbers, never additional personal properties',async()=>{
  const {head}=documentFixture();
  const root=new Element('div');
  const subscriber={id:'mission',label:'에코디선교회',subscriberDevices:7,events:3,
    delivered:2,pending:1,failed:0,tokenHash:'secret_not_for_ui',endpoint:'https://example.invalid/secret'};
  mountTenantNotificationMetrics(root,{topic:'mission',load:async()=>({ok:true,topics:[subscriber]})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.children.length,1);
  assert.equal(head.children.length,1);
  const panel=root.children[0], rows=panel.children[4];
  assert.equal(rows.children.length,1);
  const text=rows.children[0].children.map(item=>item.textContent).join(' ');
  assert.match(text,/구독 기기 7/);
  assert.equal(text.includes('secret_not_for_ui'),false);
  assert.equal(text.includes('example.invalid'),false);
});
test.after(()=>{globalThis.document=previousDocument});
