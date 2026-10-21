import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../shell/user-ai-entry.js',import.meta.url),'utf8');

function run(pathname,surface='public',leftovers=0){
  let created=0;let removed=0;let appended=0;
  const nodes=Array.from({length:leftovers},()=>({remove(){removed+=1}}));
  const html={dataset:{ekodiService:'ekodimall',ekodiUserSurface:surface}};
  const document={
    documentElement:html,currentScript:null,readyState:'complete',
    querySelector(){return null},
    querySelectorAll(){return nodes},
    createElement(){created+=1;return {dataset:{}}},
    head:{append(){appended+=1}},body:{append(){appended+=1}},
  };
  const window={};
  vm.runInNewContext(source,{window,document,location:{pathname,assign(){}},URL});
  return {created,removed,appended,window};
}

test('retired User AI entry never mounts on any EKODI surface',()=>{
  for(const path of ['/','/ekodimall','/edu/study/live/lab/','/jadam/marketing','/admin','/ai/','/mnubiz/']){
    for(const surface of ['public','workspace','admin']){
      const r=run(path,surface);
      assert.equal(r.created,0,`${surface}:${path}`);
      assert.equal(r.appended,0,`${surface}:${path}`);
    }
  }
});

test('retired User AI entry purges boxes left by a stale cached bundle',()=>{
  const r=run('/edu/study/live/lab/','public',2);
  assert.equal(r.removed,2);
  assert.equal(r.window.__EKODI_USER_AI_ENTRY_RETIRED__,true);
});

test('retired module carries no command box markup',()=>{
  assert.doesNotMatch(source,/AI로 하기|무엇을 원하세요|해줘<\/button>|innerHTML/);
});
