import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const ecosystem=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
const registryById=new Map((ecosystem.services||[]).map(service=>[service.id,service]));

const include=(EKODI_SERVICE_MANIFEST.services||[])
  .filter(service=>{
    const registry=registryById.get(service.id);
    return registry?.productionVerified===true
      && service.state!=='planned'
      && service.shellIntegration!=='pending'
      && service.shellIntegration!=='planned';
  })
  .map(service=>({
    id:service.id,
    url:service.auditUrl||service.url,
    integration:service.shellIntegration,
  }));

if(!include.length)throw new Error('No production-verified EKODI services available for production Shell audit');
process.stdout.write(JSON.stringify({include}));
