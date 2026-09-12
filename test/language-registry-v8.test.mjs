import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';
import { MANAGED_LANGUAGE_SITES } from '../config/managed-language-sites.js';
import {
  EKODI_LANGUAGE_REGISTRY,
  languageStatesForService,
  languageStatusSnapshot,
  normalizePlatformLocale,
  publishedLocalesForService,
  renderLanguageRegistryBootstrap
} from '../config/language-registry.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('one central language registry owns platform language definitions',()=>{
  assert.equal(EKODI_LANGUAGE_REGISTRY.version,2);
  assert.equal(EKODI_LANGUAGE_REGISTRY.sourceLocale,'ko-KR');
  assert.equal(new Set(EKODI_LANGUAGE_REGISTRY.languages.map(item=>item.locale)).size,EKODI_LANGUAGE_REGISTRY.languages.length);
  assert.ok(EKODI_LANGUAGE_REGISTRY.languages.length>=9);
  assert.equal(normalizePlatformLocale('KO'),'ko-KR');
  assert.equal(normalizePlatformLocale('zh-Hans'),'zh-CN');
  assert.equal(normalizePlatformLocale('mya'),'my');
  assert.match(renderLanguageRegistryBootstrap(),/__EKODI_LANGUAGE_REGISTRY__/);
});
test('public selectors expose only published locales and default new site languages to queued',()=>{
  assert.deepEqual(publishedLocalesForService('biz'),['ko-KR','en','zh-CN','ja','vi','ne']);
  assert.deepEqual(publishedLocalesForService('community'),['ko-KR']);
  const states=languageStatesForService('community');
  assert.equal(states.find(item=>item.locale==='ko-KR')?.status,'source');
  assert.equal(states.find(item=>item.locale==='en')?.status,'queued');
  assert.equal(states.find(item=>item.locale==='en')?.public,false);
  const biz=languageStatesForService('biz');
  assert.equal(biz.find(item=>item.locale==='en')?.status,'published');
  assert.equal(biz.find(item=>item.locale==='en')?.public,true);
});

test('status snapshot is read-only reporting for root plus every registered service',()=>{
  const snapshot=languageStatusSnapshot(EKODI_SERVICE_MANIFEST.services);
  assert.equal(snapshot.sites.length,EKODI_SERVICE_MANIFEST.services.length+1);
  assert.equal(snapshot.policy.visibility,'published-only');
  assert.equal(snapshot.policy.admin,'site-scoped-and-platform-aggregate-publication-control');
  assert.equal(snapshot.registryVersion,2);
  assert.ok(snapshot.publicationStates.published.public);
  assert.equal(snapshot.sites.find(site=>site.id==='community')?.multilingual,false);
  assert.equal(snapshot.sites.find(site=>site.id==='biz')?.multilingual,true);
  assert.equal(snapshot.sites.find(site=>site.id==='ekodi')?.publishedLocales.length,4);
});
test('shell and injector consume the registry instead of per-service language arrays',async()=>{
  const [manifest,injector,worker,runtime]=await Promise.all([
    read('ekodi-service-manifest.js'),read('ekodi-shell-injector.js'),read('ekodi-shell-worker.js'),read('shell/user-language.js')
  ]);
  assert.match(manifest,/readyLocales:/); // legacy metadata may remain during independent service migrations
  assert.match(injector,/publishedLocalesForService/);
  assert.doesNotMatch(injector,/serviceForId\(id\)\?\.readyLocales/);
  assert.match(worker,/LANGUAGE_REGISTRY_BOOTSTRAP/);
  assert.match(worker,/\/language-registry\.json/);
  assert.match(runtime,/const VERSION=7/);
  assert.match(runtime,/visibleLanguages/);
  assert.match(runtime,/languageChoiceAvailable/);
  assert.match(runtime,/select\.replaceChildren/);
});

test('admin language page manages publication while keeping translation readiness guarded',async()=>{
  const [admin,api,menu,demand,build,siteWorker]=await Promise.all([
    read('admin-language-status.js'),read('api-worker.js'),read('admin-menu-registry.js'),read('admin-demand-loader.js'),read('scripts/build.mjs'),read('site-worker.js')
  ]);
  assert.match(admin,/api\/control\/language-status/);
  assert.match(admin,/method:'PUT'/);
  assert.match(admin,/data-language-action/);
  assert.match(api,/languagePublicationMatch/);
  assert.match(api,/setLanguagePublication/);
  assert.match(menu,/id: 'language-status'/);
  assert.match(demand,/admin-language-status\.js/);
  assert.match(build,/admin-language-status\.js/);
  assert.match(siteWorker,/\/admin-language-status\.js/);
});
