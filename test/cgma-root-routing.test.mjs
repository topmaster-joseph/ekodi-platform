import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const worker=await readFile(new URL('../site-worker.js',import.meta.url),'utf8');
const shell=await readFile(new URL('../site-shell-worker.js',import.meta.url),'utf8');
const constitution=JSON.parse(await readFile(new URL('../governance/constitution/constitution.json',import.meta.url),'utf8'));

test('CGMA canonical root path proxies to the independent site upstream',()=>{
  assert.match(worker,/const CGMA_PREFIX = '\/cgma'/);
  assert.match(worker,/cheonggye-market\.pages\.dev/);
  assert.match(worker,/url\.pathname === CGMA_PREFIX \|\| url\.pathname\.startsWith\(CGMA_PREFIX \+ '\/'\)/);
  assert.match(worker,/CGMA_ROUTE|site-path\.js/);
});

test('CGMA keeps its own customer-site chrome under the root path',()=>{
  assert.match(shell,/customerOwnedRootPath/);
  assert.match(shell,/path==='\/cgma'\|\|path\.startsWith\('\/cgma\/'\)/);
});

test('CGMA legacy and customer domains canonicalize to ekodi.kr/cgma',()=>{
  const redirects=constitution.legacyDomainTargets||{};
  assert.equal(redirects['cgma.or.kr'],'https://ekodi.kr/cgma');
  assert.equal(redirects['www.cgma.or.kr'],'https://ekodi.kr/cgma');
  assert.equal(redirects['cgma.ekodi.kr'],'https://ekodi.kr/cgma');
  assert.equal(redirects['cgma.ai.ekodi.kr'],'https://ekodi.kr/cgma/ai');
});
