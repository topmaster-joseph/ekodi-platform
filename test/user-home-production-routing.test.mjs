import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [router,injector,standalone,standaloneCss,shell]=await Promise.all([
  readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/progressive-home.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/progressive-home.css',import.meta.url),'utf8'),
  readFile(new URL('../shell/shell.js',import.meta.url),'utf8'),
]);

test('brand-independent workspace homes receive progressive focus without shared chrome',()=>{
  assert.match(router,/space-storefront[^\n]+injectEkodiProgressiveHome/);
  assert.match(router,/independent-workspace-site[^\n]+injectEkodiProgressiveHome/);
  assert.match(router,/routeEkodiBizPublic[\s\S]+injectEkodiProgressiveHome\(rewritten\)/);
  assert.match(router,/isCgmaRoot[\s\S]+injectEkodiProgressiveHome\(legacyResponse\)/);
  assert.match(router,/isProjectionHome[\s\S]+injectEkodiProgressiveHome\(projected\)/);
});

test('lightweight progressive injector adds only focus assets and markers',()=>{
  assert.match(injector,/export function injectEkodiProgressiveHome/);
  assert.match(injector,/data-ekodi-progressive-home-engine/);
  assert.match(injector,/progressive-home\.js/);
  assert.match(injector,/progressive-home\.css/);
  assert.doesNotMatch(standalone,/EKODIShell/);
  assert.doesNotMatch(standalone,/My EKODI/);
  assert.doesNotMatch(standalone,/ekodi-user-ui-fallback-header/);
});

test('standalone progressive engine is accessible, reversible and hash-aware',()=>{
  assert.match(standalone,/data-ekodi-progressive-reveal/);
  assert.match(standalone,/aria-expanded/);
  assert.match(standalone,/aria-controls/);
  assert.match(standalone,/hashchange/);
  assert.match(standalone,/더보기/);
  assert.match(standalone,/간단히/);
  assert.match(standaloneCss,/:focus-visible/);
  assert.match(standaloneCss,/prefers-reduced-motion/);
});

test('full Shell and lightweight engine cannot double-apply home focus',()=>{
  assert.match(shell,/ekodiProgressiveHomeApplied/);
  assert.match(shell,/data-ekodi-progressive-reveal/);
  assert.match(standalone,/ekodiProgressiveHomeApplied/);
});

test('production routing keeps official root and Church outside lightweight injection',()=>{
  assert.doesNotMatch(router,/url\.pathname===['"]\/['"][^\n]*injectEkodiProgressiveHome/);
  assert.doesNotMatch(router,/ekodichurch[^\n]*injectEkodiProgressiveHome/);
  assert.match(router,/isCgmaRoot/);
});
