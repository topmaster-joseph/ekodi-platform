import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const libraryScript = read('books/buy/library.js');
const voiceScript = read('books/buy/voice-studio.js');

const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(isOperator) {
  const elements = new Map();
  const node = () => ({
    hidden:false, disabled:false, textContent:'', className:'',
    append(...items){ this.children = (this.children || []).concat(items); },
    replaceChildren(...items){ this.children = items; },
    addEventListener(){},
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id,node());
    return elements.get(id);
  };
  let callback, signedIn = false, voiceChecks = 0;
  const window = {
    EkodiBooksCommerce: {
      BASE:'/books',
      api: async path => {
        if (path !== 'library') throw new Error('UNEXPECTED_API: ' + path);
        if (!signedIn) throw Object.assign(new Error('login_required'),{status:401});
        return { items:[], operator:isOperator, displayName:'테스트 운영자' };
      },
      mountGoogle: (_host,_onStatus,onSuccess) => { callback = onSuccess; },
      session:async()=>({accessToken:'synthetic-test-token'}),
    },
    EkodiVoiceStudio: {refresh(){voiceChecks++;}},
    EkodiLibraryTabs: {showOperator(){}, render(){}},
  };
  const document = {
    getElementById: get,
    createElement: () => node(),
    createDocumentFragment: () => node(),
  };
  const context = {
    window, document, location:{pathname:'/books/library/'},
    fetch:async()=>({json:async()=>({books:[]})}),
    setTimeout, clearTimeout, console, URL,
  };
  vm.runInNewContext(libraryScript,context);
  for(let i=0;i<6;i++) await tick();
  assert.equal(typeof callback,'function','guest must see login callback');
  assert.equal(voiceChecks,0,'guest cannot trigger operator voice refresh');
  signedIn = true;
  await callback();
  for(let i=0;i<6;i++) await tick();
  return {voiceChecks,operatorVisible:get('operatorPanel').hidden===false};
}

test('Google sign-in on existing library page rechecks voice studio for server-authorized operator',async()=>{
  const result=await fixture(true);
  assert.equal(result.voiceChecks,1);
  assert.equal(result.operatorVisible,true);
});

test('non-operator sign-in never requests admin voice refresh',async()=>{
  const result=await fixture(false);
  assert.equal(result.voiceChecks,0);
});

test('voice studio exposes only refresh; its API still relies on server-verified bearer',()=>{
  assert.match(voiceScript,/window\.EkodiVoiceStudio = Object\.freeze\(\{ refresh: render \}\)/);
  assert.match(voiceScript,/if \(error\.status === 401 \|\| error\.status === 403\) return/);
  assert.match(voiceScript,/\/api\/commerce\/admin\/voice\/sample/);
  assert.match(libraryScript,/if \(data\.operator === true\) \{[\s\S]*?window\.EkodiVoiceStudio\?\.refresh\(\)/);
  assert.doesNotMatch(libraryScript,/operator\s*:\s*true/);
});
