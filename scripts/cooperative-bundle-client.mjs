import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Compile through the pinned release bundler without credentials or deployment.
// Running the resulting Worker in Node exposes exactly the serialized browser JS.
export async function loadBundledCooperativeClient() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ekodi-cooperative-bundle-'));
  try {
    const entry=path.join(directory,'cooperative-client-entry.js');
    const config=path.join(directory,'wrangler.toml');
    const output=path.join(directory,'bundle');
    await fs.writeFile(path.join(directory,'package.json'),'{"type":"module"}\n');
    await fs.writeFile(entry,`import {cooperativeScript} from ${JSON.stringify(path.resolve('cooperative-ui.js'))};\nexport default {fetch(){return new Response(cooperativeScript());}};\n`);
    await fs.writeFile(config,`name = "cooperative-client-source-qa"\nmain = ${JSON.stringify(entry)}\ncompatibility_date = "2026-08-12"\nworkers_dev = false\n`);
    execFileSync('npx',['--yes','wrangler@4.119.0','deploy','--dry-run','--config',config,'--outdir',output],{
      cwd:process.cwd(),env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:180000,maxBuffer:8*1024*1024,
    });
    const bundled=await import(pathToFileURL(path.join(output,'cooperative-client-entry.js')).href);
    const script=await (await bundled.default.fetch()).text();
    return {script,wranglerVersion:'4.119.0',serializedNameHelperCalls:/\b__name\(/.test(script),productionMutation:false};
  } finally {await fs.rm(directory,{recursive:true,force:true});}
}
