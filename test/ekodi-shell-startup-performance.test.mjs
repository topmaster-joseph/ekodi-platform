import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('shared browser Shell requests public manifest and theme concurrently, honoring HTTP cache', async () => {
  const source=await readFile(new URL('../shell/shell.js',import.meta.url),'utf8');
  const requests=[];
  // Keep both requests unresolved: an accidental sequential await would only
  // start manifest, whereas the correct startup starts both immediately.
  const context={
    window:{addEventListener(){}},
    document:{
      currentScript:{dataset:{ekodiService:'church',ekodiSurface:'public',ekodiShell:'off'}},
      documentElement:{dataset:{}},
      addEventListener(){},
    },
    location:{href:'https://ekodi.kr/ekodichurch/',hostname:'ekodi.kr',hash:''},
    history:{replaceState(){}},
    crypto:{getRandomValues(values){values[0]=123;return values;}},
    URL,URLSearchParams,
    fetch(url,options){requests.push({url,options});return new Promise(()=>{});},
    console:{warn(){},error(){}},
  };
  runInNewContext(source,context,{filename:'shell/shell.js'});
  assert.deepEqual(requests.map(request=>new URL(request.url).pathname),[
    '/shell/manifest.json',
    '/shell/theme.json',
  ]);
  for(const request of requests){
    assert.equal(request.options.mode,'cors');
    assert.equal(request.options.cache,undefined,'respect public HTTP response cache headers; do not force no-store');
  }
});

test('Shell bundle starts unified auth fetch alongside all static fragments on cold edge cache', async () => {
  const {default:worker}=await import('../ekodi-shell-worker.js');
  const requested=[];
  let release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const env={ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    requested.push(path);
    if(path==='/user-context.js')await delayed;
    return new Response(path==='/shell.js'?'window.ekodiShellCore=true;':`// ${path}`,{status:200});
  }}};
  const pending=worker.fetch(new Request('https://shell-test.invalid/shell.js'),env,{waitUntil(){}});
  try{
    assert.ok(requested.includes('/user-context.js'),'the deliberately slow fragment must have started');
    assert.ok(requested.includes('/unified-user-auth.js'),'auth fragment must start before the slow fragment resolves');
  }finally{release();}
  const response=await pending;
  assert.equal(response.status,200);
  assert.match(await response.text(),/unified-user-auth\.js/);
});

test('public shared Shell is parser-nonblocking while admin and workspace boot timing stays unchanged', async () => {
  const {injectEkodiShell}=await import('../ekodi-shell-injector.js');
  const originalRewriter=globalThis.HTMLRewriter;
  const insertions=[];
  class FakeHTMLRewriter {
    on(selector,handler){
      if(selector==='head')handler.element({
        prepend(html){insertions.push(html);},
        append(html){insertions.push(html);},
      });
      return this;
    }
    transform(response){return response;}
  }
  globalThis.HTMLRewriter=FakeHTMLRewriter;
  const scriptFor=(service,surface)=>{
    insertions.length=0;
    injectEkodiShell(
      new Response('<html><head></head><body></body></html>',{
        headers:{'content-type':'text/html; charset=utf-8'},
      }),
      service,surface,
    );
    return insertions.find(html=>html.includes('data-ekodi-member-gate'))||'';
  };
  try{
    assert.match(scriptFor('church','public'),/<script src="https:\/\/ekodi\.kr\/shell\/shell\.js" defer /);
    assert.match(scriptFor('mall','public'),/<script src="https:\/\/ekodi\.kr\/shell\/shell\.js" defer /);
    assert.doesNotMatch(scriptFor('my','workspace'),/shell\/shell\.js" defer /);
    assert.doesNotMatch(scriptFor('my','admin'),/shell\/shell\.js" defer /);
  }finally{
    if(originalRewriter===undefined)delete globalThis.HTMLRewriter;
    else globalThis.HTMLRewriter=originalRewriter;
  }
});
