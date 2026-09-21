import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

const productionConfigs=[
  'wrangler.site.toml',
  'wrangler.api.toml',
  'wrangler.my.toml',
  'wrangler.ai.toml',
  'wrangler.ai.release.toml',
  'wrangler.life.toml',
  'wrangler.work.toml',
  'wrangler.money.toml',
  'wrangler.bible.toml',
  'wrangler.shell.toml',
  'wrangler.space.toml',
  'wrangler.books.toml',
  'wrangler.social.toml',
  'wrangler.author.toml',
  'wrangler.energy.toml',
  'wrangler.storage.toml',
  'wrangler.support.toml',
  'wrangler.journal.toml',
  'wrangler.finance.toml',
  'wrangler.business.toml',
  'wrangler.ekodibiz.toml',
  'wrangler.delivery.toml',
  'wrangler.education.toml',
  'wrangler.community.toml',
  'wrangler.publishing.toml',
  'wrangler.management.toml',
  'wrangler.experience.toml',
  'wrangler.personal-finance.toml',
  'wrangler.marketing-domains.toml',
  'wrangler.workspace-platform.toml',
  'wrangler.workspace-platform-bootstrap.toml',
  'wrangler.marketing-publishing.toml',
  'wrangler.local-commerce.toml',
  'wrangler.marketing-growth.toml',
  'wrangler.service-proxy.toml',
  'wrangler.biz-legacy.toml',
  'wrangler.legacy-redirect.toml',
  'wrangler.ekodibiz-pay-gateway.toml',
  'sites/ekodi-mall/api/wrangler.toml',
  'sites/ekodi-insurance/api/wrangler.toml',
];

const contents=new Map();
for(const file of productionConfigs){
  const text=await read(file);
  contents.set(file,text);
  assert(/(^|\n)workers_dev\s*=\s*false\s*(?:\n|$)/.test(text),`${file}: production workers_dev must be false`);
  assert(/(^|\n)preview_urls\s*=\s*false\s*(?:\n|$)/.test(text),`${file}: production preview_urls must be false`);
}

const workerNames=new Set();
for(const [file,text] of contents){
  const name=text.match(/(^|\n)name\s*=\s*"([^"]+)"/)?.[2];
  assert(name,`${file}: Worker name missing`);
  workerNames.add(name);
}

const shared=contents.get('wrangler.site.toml');
const boundServices=[...shared.matchAll(/(^|\n)service\s*=\s*"([^"]+)"/g)].map(match=>match[2]);
for(const service of boundServices){
  assert(workerNames.has(service),`Shared Site binding target ${service} is not covered by the closed production Worker exposure registry`);
}

for(const file of [
  'deploy/manifests/control-api.worker.json',
  'deploy/manifests/my.worker.json',
  'deploy/manifests/ai-control.worker.json',
  'script.js',
  'site-worker.js',
]){
  const text=await read(file);
  assert(!/topmaster-joseph\.workers\.dev/i.test(text),`${file}: production runtime or verifier still references a public workers.dev endpoint`);
}

const myManifest=JSON.parse(await read('deploy/manifests/my.worker.json'));
assert(myManifest.worker.requests.every(item=>String(item.url||'').startsWith('https://ekodi.kr/')),'My EKODI production probes must use canonical ekodi.kr paths');

const aiManifest=JSON.parse(await read('deploy/manifests/ai-control.worker.json'));
assert(aiManifest.worker.requests.every(item=>!item.candidateUrl),'AI production candidate probes must traverse the canonical service-binding edge using version overrides');

const controlManifest=JSON.parse(await read('deploy/manifests/control-api.worker.json'));
assert(controlManifest.worker.requests.every(item=>!String(item.url||'').includes('workers.dev')),'Control API production probes must not use workers.dev');

console.log(`Production Worker exposure valid: ${productionConfigs.length} production configs close workers.dev/preview URLs; ${boundServices.length} Shared Site service bindings are covered by the hardened registry.`);

function assert(condition,message){
  if(!condition){
    console.error(`Production Worker exposure validation failed: ${message}`);
    process.exit(1);
  }
}
