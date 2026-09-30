import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const json=path=>JSON.parse(read(path));
const fail=[];

const policy=json('config/external-ai-local-bridge-policy.json');
const manifest=json('browser/ekodi-external-ai-bridge/manifest.json');
const background=read('browser/ekodi-external-ai-bridge/background.js');
const admin=read('browser/ekodi-external-ai-bridge/admin-bridge.js');
const provider=read('browser/ekodi-external-ai-bridge/provider-bridge.js');
const dock=read('admin-assist-dock.js');

if(policy.policyId!=='EXTERNAL-AI-LOCAL-BRIDGE-001'||policy.status!=='enforced')fail.push('bridge policy identity/status drifted');
if(policy.userAgency?.explicitProviderSelectionRequired!==true||policy.userAgency?.autoSubmit!==false||policy.userAgency?.responseCapture!==false)fail.push('user-agency boundary drifted');
for(const key of ['promptInUrl','serverPromptPersistence','cookieRead','credentialRead','clipboardRead']){
  if(policy.dataBoundary?.[key]!==false)fail.push(`dataBoundary.${key} must remain false`);
}
if(policy.dataBoundary?.sessionStorageOnly!==true||policy.dataBoundary?.pendingTtlSeconds!==120)fail.push('session-only TTL boundary drifted');
if(manifest.manifest_version!==3)fail.push('manifest v3 required');
if(JSON.stringify(manifest.permissions||[]).includes('clipboardRead'))fail.push('clipboardRead permission forbidden');
const hosts=new Set(manifest.host_permissions||[]);
for(const host of ['https://ekodi.kr/admin/*','https://chatgpt.com/*','https://claude.ai/*','https://gemini.google.com/*','https://chat.qwen.ai/*']){
  if(!hosts.has(host))fail.push(`missing exact host permission: ${host}`);
}
if([...hosts].some(host=>host.includes('*://')||host==='https://*/*'))fail.push('arbitrary host permission forbidden');
if(!background.includes("chrome.storage.session")||!background.includes("url:'about:blank'"))fail.push('one-shot session handoff path missing');
if(!admin.includes("ekodi-external-ai-bridge-ready")||!dock.includes("ekodi-external-ai-handoff"))fail.push('admin bridge handshake missing');
if(!provider.includes("fillPrompt")||provider.includes(".click()")||/submit\s*\(/i.test(provider))fail.push('provider bridge must fill only and never auto-submit');
if(/document\.cookie|chrome\.cookies|localStorage/.test(background+admin+provider))fail.push('cookie or persistent browser storage access forbidden');

if(fail.length){
  console.error(`External AI local bridge validation failed (${fail.length})`);
  for(const item of fail)console.error(`- ${item}`);
  process.exit(1);
}
console.log('EXTERNAL-AI-LOCAL-BRIDGE-001: OK');
