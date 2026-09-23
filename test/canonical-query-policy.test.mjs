import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonicalTrackingQueryRedirect,
  isHumanFacingCanonicalRoute,
  isTrackingQueryParam,
  stripTrackingQuery,
} from '../canonical-query-policy.js';

test('tracking query policy recognizes common attribution parameters without matching functional keys',()=>{
  for(const key of ['utm_source','UTM_campaign','gclid','fbclid','msclkid','srsltid','_gl'])assert.equal(isTrackingQueryParam(key),true,key);
  for(const key of ['return_to','code','state','page','q','filter','token'])assert.equal(isTrackingQueryParam(key),false,key);
});

test('canonical query cleanup strips tracking keys while preserving functional query context',()=>{
  const {url,changed,removed}=stripTrackingQuery('https://ekodi.kr/ekodimission/admin?utm_source=chatgpt.com&utm_medium=referral&return_to=%2Fekodimission%2Fadmin%2Fevents&state=abc&page=2&fbclid=x');
  assert.equal(changed,true);
  assert.deepEqual(new Set(removed),new Set(['utm_source','utm_medium','fbclid']));
  assert.equal(url.origin+url.pathname,'https://ekodi.kr/ekodimission/admin');
  assert.equal(url.searchParams.get('return_to'),'/ekodimission/admin/events');
  assert.equal(url.searchParams.get('state'),'abc');
  assert.equal(url.searchParams.get('page'),'2');
  assert.equal(url.searchParams.has('utm_source'),false);
  assert.equal(url.searchParams.has('fbclid'),false);
});

test('human page GET receives a canonical 308 while system routes and non-GET requests are untouched',()=>{
  const redirect=canonicalTrackingQueryRedirect(new Request('https://ekodi.kr/jadam/admin?utm_source=chatgpt.com&tab=menu'));
  assert.equal(redirect?.status,308);
  assert.equal(redirect?.headers.get('location'),'https://ekodi.kr/jadam/admin?tab=menu');
  assert.equal(redirect?.headers.get('x-ekodi-canonical-query'),'tracking-params-removed');

  assert.equal(canonicalTrackingQueryRedirect(new Request('https://ekodi.kr/api/items?utm_source=chatgpt.com')),null);
  assert.equal(canonicalTrackingQueryRedirect(new Request('https://ekodi.kr/jadam/admin?utm_source=chatgpt.com',{method:'POST'})),null);
  assert.equal(canonicalTrackingQueryRedirect(new Request('https://ekodi.kr/jadam/admin?tab=menu')),null);
  assert.equal(isHumanFacingCanonicalRoute('/shell/app.js'),false);
});

test('shared browser shell contains address-bar fallback cleanup for shell-enabled user and admin surfaces',async()=>{
  const shell=await readFile(new URL('../shell/shell.js',import.meta.url),'utf8');
  assert.match(shell,/cleanTrackingQueryFromAddressBar/);
  assert.match(shell,/history\.replaceState/);
  assert.match(shell,/utm_/);
  assert.match(shell,/return_to/);
});

test('tracking cleanup keeps the URL fragment while removing attribution keys',()=>{
  const {url}=stripTrackingQuery('https://ekodi.kr/ekodimission?utm_source=chatgpt.com&lang=ko#applications');
  assert.equal(url.toString(),'https://ekodi.kr/ekodimission?lang=ko#applications');
});
