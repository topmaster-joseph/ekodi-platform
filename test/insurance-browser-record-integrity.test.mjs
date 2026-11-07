import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sites/ekodi-insurance/public/app.js', import.meta.url), 'utf8');
const beginning = source.indexOf('function blankState(){');
const ending = source.indexOf('\nfunction money(', beginning);
assert.ok(beginning >= 0 && ending > beginning);
const actualLoader = source.slice(beginning, ending);

const KEY = 'ekodi-insurance-staging-v3';
const V2 = 'ekodi-insurance-staging-v2';
const V1 = 'ekodi-insurance-staging-v1';

function harness(initial={}) {
  const data = new Map(Object.entries(initial));
  const touched = { writes: [], removes: [] };
  const ctx = vm.createContext({
    Object, Array, JSON,
    localStorage: {
      getItem: key => data.has(key) ? data.get(key) : null,
      setItem(key, value) { touched.writes.push(key); data.set(key, String(value)); },
      removeItem(key) { touched.removes.push(key); data.delete(key); }
    }
  });
  vm.runInContext(
    "const KEY='ekodi-insurance-staging-v3';\n" +
    "const LEGACY_KEYS=['ekodi-insurance-staging-v2','ekodi-insurance-staging-v1'];\n" +
    "let localRecordsUnreadable=false;\n" + actualLoader,
    ctx
  );
  return {
    load: () => ctx.loadState(),
    save: () => ctx.saveState(),
    blocked: () => vm.runInContext('localRecordsUnreadable', ctx),
    snapshot: () => Object.fromEntries(data),
    touched
  };
}

test('v2 and v1 auto-upgrade never remove original local insurance records', () => {
  for (const legacy of [V2,V1]) {
    const records = JSON.stringify({
      policies: [{ id:'synthetic-policy', company:'Example' }],
      claims: [{ id:'synthetic-claim', detail:'test note' }],
      consultations: [{ id:'synthetic-local-only' }]
    });
    const store = harness({ [legacy]: records });
    const state = store.load();
    assert.equal(state.policies.length, 1);
    assert.equal(state.claims.length, 1);
    assert.equal(store.blocked(), false);
    assert.equal(store.snapshot()[legacy], records, 'original key must survive');
    assert.equal(store.touched.removes.length, 0);
    assert.equal(store.touched.writes.length, 1);
    assert.equal(store.touched.writes[0], KEY);
    assert.equal(JSON.parse(store.snapshot()[KEY]).consultations[0].id, 'synthetic-local-only');
  }
});

test('valid v3 local data is not replaced or modified on page load', () => {
  const records = JSON.stringify({ policies:[], claims:[], consultations:[], advisorChat:{messages:[]} });
  const store = harness({ [KEY]: records, [V2]: 'older-version-data-not-to-touch' });
  const result = store.load();
  assert.equal(result.policies.length, 0);
  assert.equal(store.blocked(), false);
  assert.equal(store.snapshot()[KEY], records);
  assert.equal(store.snapshot()[V2], 'older-version-data-not-to-touch');
  assert.deepEqual(store.touched.writes, []);
  assert.deepEqual(store.touched.removes, []);
});

test('corrupt current or legacy local data never gets overwritten by fallback save', () => {
  const malformed = [
    '{bad', '', 'null', '[]', '{"policies":null}',
    '{"claims":"wrong"}', '{"consultations":{}}',
    '{"advisorChat":{"messages":null}}'
  ];
  for (const bad of malformed) {
    for (const key of [KEY,V2]) {
      const store = harness({ [key]:bad });
      const before=store.snapshot();
      const state=store.load();
      assert.equal(store.blocked(), true, key + ': ' + bad);
      assert.equal(state.policies.length, 0);
      store.save();
      assert.deepEqual(store.snapshot(), before, 'do not overwrite ' + key);
      assert.deepEqual(store.touched.writes, []);
      assert.deepEqual(store.touched.removes, []);
    }
  }
});

test('unreadable old data disables editing with accessible notice and preserves navigation', () => {
  assert.match(source, /if\(localRecordsUnreadable\)\{\s*const notice=document\.createElement\('p'\)/);
  assert.match(source, /notice\.setAttribute\('role','alert'\)/);
  assert.match(source, /control\.disabled=true/);
  assert.match(source, /control\.matches\('\[data-view\], \.nav button'\)/);
  assert.match(source, /function sendUserMessage\(text\)\{if\(localRecordsUnreadable\)return;/);
  assert.doesNotMatch(actualLoader, /LEGACY_KEYS\.forEach\(k=>localStorage\.removeItem\(k\)\)/);
  assert.match(source, /confirmDeleteBtn.*addEventListener\('click'/);
});


test('read-only recovery gate intercepts future submit and delete controls without blocking navigation', () => {
  const start=source.indexOf('function guardUnreadableRecordInteraction(event){');
  const end=source.indexOf('\nfunction uid(',start);
  assert.ok(start>=0&&end>start,'live source must install capture-phase recovery guard');
  const listeners=new Map();
  const context=vm.createContext({
    localRecordsUnreadable:true,
    document:{addEventListener(type,handler,capture){listeners.set(type,{handler,capture})}}
  });
  vm.runInContext(source.slice(start,end),context);
  assert.equal(listeners.get('click').capture,true,'click gate must intercept before delegated handlers');
  assert.equal(listeners.get('submit').capture,true,'submit gate must intercept before form handlers');
  const fire=(type,kind)=>{
    const out={prevented:false,stopped:false};
    const event={
      type,
      target:{closest(){return kind==='empty'?null:{matches(){return kind==='navigation'}}}},
      preventDefault(){out.prevented=true},
      stopImmediatePropagation(){out.stopped=true}
    };
    listeners.get(type).handler(event);
    return out;
  };
  assert.deepEqual(fire('submit','form'),{prevented:true,stopped:true});
  assert.deepEqual(fire('click','delete'),{prevented:true,stopped:true},
    'newly inserted active delete buttons must remain inert');
  assert.deepEqual(fire('click','navigation'),{prevented:false,stopped:false});
  assert.deepEqual(fire('click','empty'),{prevented:false,stopped:false});
  context.localRecordsUnreadable=false;
  assert.deepEqual(fire('submit','form'),{prevented:false,stopped:false});
  assert.deepEqual(fire('click','delete'),{prevented:false,stopped:false});
});
