import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const include=(EKODI_SERVICE_MANIFEST.services||[])
  .filter(service=>service.state!=='planned'&&service.shellIntegration!=='pending'&&service.shellIntegration!=='planned')
  .map(service=>({
    id:service.id,
    url:service.auditUrl||service.url,
    integration:service.shellIntegration,
  }));

if(!include.length)throw new Error('No active EKODI services available for production Shell audit');
process.stdout.write(JSON.stringify({include}));
