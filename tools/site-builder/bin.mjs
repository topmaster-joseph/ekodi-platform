#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
