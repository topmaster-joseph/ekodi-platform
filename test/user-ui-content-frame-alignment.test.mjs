import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const header=read('shell/user-ui-header.js');
const footer=read('shell/user-ui-footer.js');
const stylesheet=read('shell/user-ui-shell.css');
const begin=header.indexOf('function findContentCanvas(){');
const end=header.indexOf('function surface(){',begin);
assert.ok(begin>=0&&end>begin,'canvas measurement helpers must exist');

function rect(width,left,top=50){
  return {width,left,right:left+width,top,height:200};
}
function element(bounds,{inner=[],excluded=false,visible=true}={}){
  return {
    isConnected:true,excluded,visible,
    getBoundingClientRect:()=>bounds,
    closest(selector){
      if(selector.includes('aside,nav,')&&excluded)return this;
      return null;
    },
    querySelectorAll:()=>inner,
  };
}
function geometry(width,{explicit=[],mains=[]}={}){
  const vars=new Map();
  const html={
    clientWidth:width,
    dataset:{},
    style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}
  };
  const document={
    documentElement:html,
    querySelectorAll:selector=>selector==='[data-ekodi-user-canvas="centered-v1"]'?explicit:mains
  };
  const context={
    document,window:{innerWidth:width+17},
    visible:n=>n.isConnected&&n.visible!==false&&n.getBoundingClientRect().width>0,
    shouldEnable:()=>true,ResizeObserver:undefined,
    canvasResizeObserver:null,activeCanvas:null,contentFrameSignature:'',
  };
  vm.runInNewContext(header.slice(begin,end),context);
  return {
    find:()=>vm.runInNewContext('findContentCanvas()',context),
    update:()=>vm.runInNewContext('updateContentFrame()',context),
    vars,html,mains,document,
  };
}
const widths=[320,390,768,1366,1440];

test('all viewport widths select actual centered inner canvas and publish symmetric edges',()=>{
  for(const width of widths){
    const inset=width<=390?16:width<=768?24:Math.round((width-1180)/2);
    const inner=element(rect(width-2*inset,inset));
    const main=element(rect(width,0),{inner:[inner]});
    const f=geometry(width,{mains:[main]});
    assert.equal(f.find(),inner,String(width));
    f.update();
    assert.equal(f.vars.get('--ekodi-user-content-left'),inset+'px',String(width));
    assert.equal(f.vars.get('--ekodi-user-content-right'),inset+'px',String(width));
    assert.equal(f.vars.get('--ekodi-user-content-inline-size'),(width-2*inset)+'px',String(width));
  }
});

test('asymmetric inner canvas preserves both margins, not just centered width',()=>{
  for(const width of widths){
    const left=width<=390?19:61,right=width<=390?13:34;
    const content=element(rect(width-left-right,left));
    const f=geometry(width,{mains:[element(rect(width,0),{inner:[content]})]});
    f.update();
    assert.equal(f.vars.get('--ekodi-user-content-left'),left+'px');
    assert.equal(f.vars.get('--ekodi-user-content-right'),right+'px');
    assert.equal(Number.parseFloat(f.vars.get('--ekodi-user-content-inline-size'))+left+right,width);
  }
});

test('explicit service marker outranks main and inner wrappers',()=>{
  const explicit=element(rect(720,130));
  const candidate=element(rect(1140,50));
  const main=element(rect(1240,0),{inner:[candidate]});
  const f=geometry(1240,{explicit:[explicit],mains:[main]});
  assert.equal(f.find(),explicit);
});

test('already bounded main remains alignment reference',()=>{
  const bounded=element(rect(1150,108));
  const f=geometry(1366,{mains:[bounded]});
  assert.equal(f.find(),bounded);
});

test('excluded sidebar/card, hidden wrapper and full-bleed main fall back to canonical canvas',()=>{
  const excluded=element(rect(1100,70),{excluded:true});
  const hidden=element(rect(1060,100),{visible:false});
  const f=geometry(1240,{mains:[element(rect(1240,0),{inner:[excluded,hidden]})]});
  assert.equal(f.find(),null);
  f.update();
  assert.equal(f.vars.size,0,'full-bleed page must not publish bogus zero-gutter content edges');
  assert.equal(f.html.dataset.ekodiContentFrame,undefined);
});

test('canvas removal resets stale geometry from the previous page',()=>{
  const f=geometry(1366,{mains:[element(rect(1366,0),{inner:[element(rect(1180,93))]})]});
  f.update();
  assert.equal(f.vars.get('--ekodi-user-content-left'),'93px');
  f.mains.splice(0);
  f.update();
  assert.equal(f.vars.size,0);
  assert.equal(f.html.dataset.ekodiContentFrame,undefined);
});

test('CSS header and footer keep distinct measured left/right edges',()=>{
  for(const marker of [
    '.ekodi-user-ui-fallback-header__inner {',
    '.ekodi-user-ui-header-fallback .ekodi-user-ui-header-fallback__inner {',
    '.ekodi-user-ui-footer__inner {'
  ]){
    const start=stylesheet.indexOf(marker);
    assert.ok(start>=0);
    const end=stylesheet.indexOf('\n}',start);
    const rule=stylesheet.slice(start,end);
    assert.match(rule,/margin-left:\s*var\(--ekodi-user-content-left, auto\)/);
    assert.match(rule,/margin-right:\s*var\(--ekodi-user-content-right, auto\)/);
  }
  assert.match(header,/margin-left:var\(--ekodi-user-content-left,auto\);margin-right:var\(--ekodi-user-content-right,auto\)/);
  assert.match(footer,/margin-left:var\(--ekodi-user-content-left,auto\)!important;margin-right:var\(--ekodi-user-content-right,auto\)!important/);
  assert.match(footer,/function serviceOwnsFooter\(\)/,'service-owned legal footers remain available');
  assert.match(header,/document\.documentElement\.clientWidth\|\|window\.innerWidth/);
});
