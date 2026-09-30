import fs from 'node:fs';

function patchFile(path, transform){
  const before=fs.readFileSync(path,'utf8');
  const after=transform(before);
  if(after===before){ console.log(`${path}: unchanged`); return; }
  fs.writeFileSync(path,after);
  console.log(`${path}: patched`);
}

patchFile('api-worker.js', text => {
  if(!text.includes("from './remote-power-control.js'")){
    const marker="import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';\n";
    if(!text.includes(marker))throw new Error('api-worker import marker not found');
    text=text.replace(marker, marker+"import { remotePowerSnapshot, requestRemoteWake } from './remote-power-control.js';\n");
  }
  if(!text.includes("remote.devices.list")){
    const marker="  if (request.method === 'POST' && path === `${CONTROL_PREFIX}/check`) {\n";
    if(!text.includes(marker))throw new Error('api-worker route marker not found');
    const block="  if (request.method === 'GET' && path === `${CONTROL_PREFIX}/remote/devices`) {\n    await writeAudit(env, auth.session, 'remote.devices.list', 'remote-power', 'remote power inventory viewed');\n    return controlJson({ ok: true, ...remotePowerSnapshot(env) }, 200, auth.response.headers);\n  }\n\n  const remoteWakeMatch = path.match(/^\\/api\\/control\\/remote\\/devices\\/([a-z0-9-]+)\\/wake$/);\n  if (remoteWakeMatch && request.method === 'POST') {\n    const deviceId = remoteWakeMatch[1];\n    const result = await requestRemoteWake(env, deviceId);\n    await writeAudit(env, auth.session, 'remote.device.wake', `remote-power:${deviceId}`, JSON.stringify({ status: result.status, code: result.body?.code || '', ok: Boolean(result.body?.ok) }));\n    return controlJson(result.body, result.status, auth.response.headers);\n  }\n\n";
    text=text.replace(marker, block+marker);
  }
  return text;
});

patchFile('admin-lazy-features.js', text => {
  if(!text.includes("'remote-power-admin.css'")){
    text=text.replace("    'ai-ops-admin.css',\n", "    'ai-ops-admin.css',\n    'remote-power-admin.css',\n");
  }
  if(!text.includes("'remote-power-admin.js'")){
    text=text.replace("    'ai-ops-admin.js',\n", "    'ai-ops-admin.js',\n    'remote-power-admin.js',\n");
  }
  return text;
});

patchFile('.dev.vars.example', text => {
  if(text.includes('REMOTE_POWER_RELAY_URL='))return text;
  const suffix=`\n# Remote PC power control. Keep real relay URL and shared secret in Worker secrets.\nREMOTE_POWER_RELAY_URL=https://remote-power-relay.example.invalid\nREMOTE_POWER_SHARED_SECRET=replace-with-long-random-secret\nREMOTE_POWER_DEVICES_JSON=[{"id":"joseph-notebook","label":"JosephNotebook"},{"id":"user3","label":"user3"},{"id":"user2","label":"user2"}]\n`;
  return text.replace(/\s*$/, '\n')+suffix;
});
