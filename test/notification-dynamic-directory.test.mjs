import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('dynamic customer coverage is read-only and only shown inside privileged fleet summary',()=>{
  const s=readFileSync(new URL('../communication-admin.js',import.meta.url),'utf8');
  const auth=s.indexOf("if(data.fleet){");
  const directory=s.indexOf("api('/api/customers/directory')");
  const metricLoop=s.indexOf("for(const item of data.topics||[])");
  assert.ok(auth>=0&&directory>auth&&metricLoop>directory);
  assert.match(s,/u\.origin!=='https:\/\/ekodi\.kr'\|\|u\.search\|\|u\.hash/);
  assert.match(s,/known\.has\(p\)\|\|additional\.has\(p\)/);
  assert.match(s,/pathname\.replace\(\/\\\/\+\$\//);
  assert.match(s,/신규 발신 권한을 자동 부여하지 않습니다/);
  assert.doesNotMatch(s,/api\/notifications\/events.*method:\s*['"]POST/);
});
