import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import platformEntry from '../platform-router-entry-worker.js';
import { mailUserPage } from '../mail-user-page.js';
import { messengerUserPage, messengerUiScript } from '../messenger-user-page.js';
import { investUserPage, investUiScript } from '../invest-user-page.js';
import { investSubjectUiScript } from '../invest-subject-ui.js';

const env={ENVIRONMENT:'test'};
const fetchPath=path=>platformEntry.fetch(new Request(`https://ekodi.kr${path}`),env,{});
const noPublicSubdomain=text=>assert.doesNotMatch(text,/https:\/\/(?:[A-Za-z0-9-]+\.)+ekodi\.kr/i);

test('Mail page is path-native and apex router owns the root/admin routes',async()=>{
  const html=await mailUserPage().text();assert.match(html,/EKODI Mail/);assert.match(html,/\/mail\/admin/);
  assert.match(html,/https:\/\/ekodi\.kr\/api\/mail\/control/);assert.match(html,/https:\/\/ekodi\.kr\/auth\//);noPublicSubdomain(html);
  const entry=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(entry,/routeMailApex/);assert.match(entry,/url\.pathname==='\/mail'/);assert.match(entry,/url\.pathname==='\/mail\/admin'/);
});

test('Messenger page and assets are path-native',async()=>{
  const html=await messengerUserPage().text();assert.match(html,/\/messenger\/messenger-ui\.js/);assert.match(html,/\/messenger\/app\.js/);assert.match(html,/https:\/\/ekodi\.kr\/auth\//);noPublicSubdomain(html);
  noPublicSubdomain(await messengerUiScript().text());
  const app=await fetchPath('/messenger/app.js');assert.equal(app.status,200);const appText=await app.text();assert.match(appText,/https:\/\/ekodi\.kr\/workspace-api/);noPublicSubdomain(appText);
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));const probe=manifest.worker.requests.find(item=>item.url==='https://messenger.ekodi.kr/app.js');assert.ok(probe);assert.ok(probe.expect.includes('https://ekodi.kr/workspace-api'));assert.ok(!probe.expect.includes('https://workspace-api.ekodi.kr'));
});

test('Invest page and assets are path-native',async()=>{
  const html=await investUserPage().text();assert.match(html,/\/invest\/app\.js/);assert.match(html,/\/invest\/invest-ui\.js/);assert.match(html,/https:\/\/ekodi\.kr\/auth\//);noPublicSubdomain(html);
  const ui=await investUiScript().text();assert.match(ui,/https:\/\/ekodi\.kr\/workspace-api/);noPublicSubdomain(ui);
  const subject=await investSubjectUiScript().text();assert.match(subject,/https:\/\/ekodi\.kr\/workspace-api/);noPublicSubdomain(subject);
  const app=await fetchPath('/invest/app.js');assert.equal(app.status,200);noPublicSubdomain(await app.text());
});

test('production worker-first routing includes all three canonical roots',async()=>{
  const wrangler=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/"\/mail\*"/);assert.match(wrangler,/"\/messenger\*"/);assert.match(wrangler,/"\/invest\*"/);
  const entry=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(entry,/routeMessengerApex/);assert.match(entry,/routeInvestApex/);assert.match(entry,/\/invest\/invest-subject-ui\.js/);
});
