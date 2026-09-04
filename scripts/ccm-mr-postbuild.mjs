import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const homepagePath=`${root}dist/homepage-ambient.js`;
const languagePath=`${root}shell/user-language.js`;
const playerPath=`${root}shell/ccm-mr-player.js`;
const [homepage,language,player]=await Promise.all([
  readFile(homepagePath,'utf8'),
  readFile(languagePath,'utf8'),
  readFile(playerPath,'utf8'),
]);

if(!player.includes("const COOKIE='ekodi_ccm_mr'"))throw new Error('CCM MR player marker missing');
if(!player.includes("buttonId='ekodi-ccm-mr-toggle'"))throw new Error('CCM MR toggle marker missing');
let next=homepage;
if(!next.includes("window.__EKODI_USER_LANGUAGE_BOOTED"))next=`${next}\n\n${language}\n`;
if(!next.includes("window.__EKODI_CCM_MR__"))next=`${next}\n\n${player}\n`;
if(next!==homepage)await writeFile(homepagePath,next);

console.log('Built shared homepage language + CCM MR runtimes into homepage-ambient.js');
