import test from 'node:test';
import assert from 'node:assert/strict';
import {freshVoiceClient} from '../services/independent-board/voices-fresh/page.mjs';

const start=freshVoiceClient.indexOf('function appendLinkedText');
const end=freshVoiceClient.indexOf('function voiceTitle');
const source=freshVoiceClient.slice(start,end);

function makeDom(){
  const document={createElement:tag=>({tag,children:[],append(...xs){this.children.push(...xs)}})};
  const node={children:[],append(...xs){this.children.push(...xs)}};
  return {document,node};
}
function run(text){
  const {document,node}=makeDom();
  new Function('document','node','text',source+';appendLinkedText(node,text)')(document,node,text);
  return node.children;
}
const flat=parts=>parts.map(p=>typeof p==='string'?p:p.textContent).join('');

test('voice body renders through appendLinkedText, never innerHTML', ()=>{
  assert.ok(start>0&&end>start);
  assert.match(freshVoiceClient,/appendLinkedText\(body,String\(item\.message\|\|''\)\)/);
  assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML/);
});

test('http(s) URLs become safe anchors and text is preserved', ()=>{
  const url='https://www.ohmynews.com/NWS_Web/OhmyTV/shorts_pg.aspx?CNTN_CD=Sx6MCipb1aA';
  const parts=run(url);
  assert.equal(parts.length,1);
  assert.equal(parts[0].tag,'a');
  assert.equal(parts[0].href,url);
  assert.equal(parts[0].target,'_blank');
  assert.match(parts[0].rel,/noopener/);
  assert.match(parts[0].rel,/noreferrer/);
});

test('trailing punctuation stays outside the link', ()=>{
  const text='보세요(https://a.com/x).';
  const parts=run(text);
  assert.equal(flat(parts),text);
  assert.equal(parts.find(p=>p.tag==='a').textContent,'https://a.com/x');
});

test('non-http schemes and markup stay plain text', ()=>{
  const text='javascript:alert(1) <img src=x onerror=alert(1)> http://)';
  const parts=run(text);
  assert.ok(parts.every(p=>typeof p==='string'));
  assert.equal(flat(parts),text);
});
