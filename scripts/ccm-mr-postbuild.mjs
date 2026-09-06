import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const homepagePath=`${root}dist/homepage-ambient.js`;
const playerPath=`${root}shell/ccm-mr-player.js`;
const [homepage,player]=await Promise.all([
  readFile(homepagePath,'utf8'),
  readFile(playerPath,'utf8'),
]);

if(!player.includes("const COOKIE='ekodi_ccm_mr'"))throw new Error('CCM MR player marker missing');
if(!player.includes("buttonId='ekodi-ccm-mr-toggle'"))throw new Error('CCM MR toggle marker missing');
if(!homepage.includes("window.__EKODI_CCM_MR__")){
  await writeFile(homepagePath,`${homepage}\n\n${player}\n`);
}

console.log('Built shared CCM MR runtime into homepage-ambient.js');
