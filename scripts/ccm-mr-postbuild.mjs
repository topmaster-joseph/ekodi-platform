import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emitDiscoveryAssets } from './discovery-build.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const playerPath=`${root}shell/ccm-mr-player.js`;
const player=await readFile(playerPath,'utf8');

// The file remains in the Shell bundle only as a compatibility tombstone so
// older cached bundles can remove the former global control. Never append the
// retired player to homepage-ambient.js again.
if(!player.includes('__EKODI_CCM_MR_RETIRED__'))throw new Error('Retired CCM MR compatibility marker missing');
if(!player.includes("dataset.ekodiGlobalMr='off'"))throw new Error('Retired CCM MR removal marker missing');
if(!player.includes('ekodi-ccm-mr-toggle'))throw new Error('Retired CCM MR legacy selector marker missing');

await emitDiscoveryAssets();

console.log('Verified retired CCM MR compatibility guard; no global audio control injected.');
