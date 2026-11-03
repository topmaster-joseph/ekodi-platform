import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

// This browser asset is loaded as a classic script, not as a module imported
// by Node tests. Every release must parse the exact shipped source.
const source=readFileSync(new URL('../growth-os-admin.js',import.meta.url),'utf8');

test('Growth OS classic browser asset parses before production deploy',()=>{
  assert.doesNotThrow(()=>new Script(source,{filename:'growth-os-admin.js'}));
  assert.match(source,/growth-os-automation-overview/);
});

test('site-admin jump links are local safe paths only',()=>{
  const line=source.split('\n').find(value=>value.includes('const adminPath='));
  assert.ok(line,'central summary should validate site admin links');
  const safe=new Function('item',line+'\nreturn adminPath;');
  assert.equal(safe({adminPath:'/ekodimall/admin/channel-settings'}),'/ekodimall/admin/channel-settings');
  assert.equal(safe({adminPath:'/cgma/admin/publishing'}),'/cgma/admin/publishing');
  for(const malicious of ['//evil.example/admin','https://evil.example','javascript:alert(1)','/a?next=evil','/a#frag','/../bad','/','/a<script>']){
    assert.equal(safe({adminPath:malicious}),'','unsafe adminPath: '+malicious);
  }
});
