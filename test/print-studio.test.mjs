import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const src=readFileSync(new URL('print-studio/studio.js',root),'utf8');
const html=readFileSync(new URL('print-studio/index.html',root),'utf8');
const css=readFileSync(new URL('print-studio/studio.css',root),'utf8');
const build=readFileSync(new URL('scripts/build.mjs',root),'utf8');
const routes=readFileSync(new URL('platform-route-registry.js',root),'utf8');
const biz=readFileSync(new URL('ekodibiz/index.html',root),'utf8');

test('EKODI Print ships a single studio and six real, non-redirect product paths',()=>{
  new vm.Script(src,{filename:'print-studio/studio.js'});
  for(const id of ['cards','banners','flyers','posters','stickers','booklets']){
    assert.ok(html.includes('href="/print/'+id+'/"'),id);
    assert.ok(build.includes("'"+id+"'"),id);
  }
  assert.match(build,/cp\(\x60\$\{root\}print-studio\x60,\s*\x60\$\{output\}print\x60/);
  assert.match(build,/print\/\$\{product\}\/index\.html/);
  assert.match(routes,/'preview','print','promotion'/);
  assert.match(biz,/href="\/print\/"/);
  assert.match(biz,/href="\/ekodibiz\/cards\/"/);
  assert.match(html,/href="\/ekodibiz\/cards\/"/);
  assert.doesNotMatch(html,/<script>(?!<\/script>)/);
});

test('Print proofing is explicit, local-only and never claims payment or submission',()=>{
  assert.match(src,/mailto:ekodibiz@gmail\.com/);
  assert.match(src,/createObjectURL/);
  assert.match(src,/window\.print\(\)/);
  assert.match(src,/requestQuote'\)\.disabled=/);
  assert.match(src,/id!=='approve'/);
  assert.doesNotMatch(src,/\bfetch\s*\(/);
  assert.doesNotMatch(src,/\blocalStorage\b|\bsessionStorage\b/);
  assert.doesNotMatch(src,/\bXMLHttpRequest\b/);
  assert.match(html,/자동 전송하지 않습니다/);
  assert.match(html,/주문 접수·견적 확정·결제·제작·배송은 아직 자동화되어 있지 않습니다/);
  assert.match(html,/id="approve"/);
  assert.match(html,/id="requestQuote" disabled/);
  assert.match(html,/id="photo".*accept="image\/jpeg,image\/png"/);
  assert.match(css,/@media print/);
});

function runStudio(path){
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{
      id,value:'',innerHTML:'',textContent:'',hidden:false,checked:false,disabled:false,
      style:{},listeners:{},files:[],
      addEventListener(type,fn){this.listeners[type]=fn;},
      checkValidity(){return true;}, reportValidity(){return true;}
    });
    return nodes.get(id);
  };
  const links=['cards','banners','flyers','posters','stickers','booklets'].map(product=>({
    dataset:{product},attributes:{},
    setAttribute(name,value){this.attributes[name]=value;}
  }));
  const document={
    getElementById:node, querySelectorAll:()=>links,
    createElement:()=>({href:'',download:'',click(){},remove(){}}),
    body:{appendChild(){}}
  };
  const context={document,location:{pathname:path},window:{location:{href:''},print(){}},
    URL:{createObjectURL:()=> 'blob:example',revokeObjectURL(){}},
    Blob,FileReader:class {},setTimeout(){},console};
  vm.runInNewContext(src,context);
  return {node,links,context};
}

test('product selection, proof preview and final consent gate behave deterministically',()=>{
  const cards=runStudio('/print/cards/');
  assert.equal(cards.node('cardHandoff').hidden,false);
  assert.equal(cards.node('editor').hidden,true);
  for (const type of ['banners','flyers','posters','stickers','booklets']){
    const app=runStudio('/print/'+type+'/');
    assert.equal(app.node('editor').hidden,false);
    assert.ok(app.node('previewSvg').innerHTML.startsWith('<svg'),type);
    assert.equal(app.node('requestQuote').disabled,true);
    app.node('approve').checked=true;
    app.node('approve').listeners.change();
    assert.equal(app.node('requestQuote').disabled,false,type);
    app.node('headline').value='새로운 문구';
    app.node('designForm').listeners.input({target:{id:'headline'}});
    assert.equal(app.node('approve').checked,false,type);
    assert.equal(app.node('requestQuote').disabled,true,type);
    assert.ok(app.node('previewSvg').innerHTML.includes('새로운 문구'),type);
  }
});

test('SVG output escapes user text and prevents SVG markup injection',()=>{
  const app=runStudio('/print/flyers/');
  app.node('headline').value='<img src=x onerror=alert(1)>';
  app.node('designForm').listeners.input({target:{id:'headline'}});
  assert.doesNotMatch(app.node('previewSvg').innerHTML,/<img/);
  assert.match(app.node('previewSvg').innerHTML,/&lt;img/);
});
