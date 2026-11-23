import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';

// ubuntu-latest moved to 26.04, where Playwright 1.55.x cannot install Chromium.
// Every job that installs a browser must run on a supported LTS image instead of
// silently failing (which is equivalent to switching browser verification off).
test('browser-installing workflow jobs never run on ubuntu-latest',()=>{
  const dir=new URL('../.github/workflows/',import.meta.url);
  const offenders=[];
  for(const name of readdirSync(dir).filter(n=>/\.ya?ml$/.test(n))){
    const lines=readFileSync(new URL(name,dir),'utf8').split('\n');
    const ji=lines.findIndex(l=>/^jobs:\s*$/.test(l)); if(ji<0) continue;
    const starts=[];
    for(let i=ji+1;i<lines.length;i++){ if(/^\S/.test(lines[i])) break; if(/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) starts.push(i); }
    starts.forEach((s,k)=>{
      const body=lines.slice(s,k+1<starts.length?starts[k+1]:lines.length).join('\n');
      if(/playwright install/.test(body)&&/^\s+runs-on:\s*ubuntu-latest\s*$/m.test(body)) offenders.push(`${name}:${lines[s].trim()}`);
    });
  }
  assert.deepEqual(offenders,[]);
});
