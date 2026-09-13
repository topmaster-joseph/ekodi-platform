import { appendFile, writeFile } from 'node:fs/promises';
import { peakRpsFromMinuteRows, telemetryWindow } from './cloudflare-observed-peak-rps-lib.mjs';
import { pickRps } from './observed-rps-source.mjs';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const explicitRps = process.env.EKODI_OBSERVED_PEAK_RPS_OVERRIDE || '0';
const repositoryRps = process.env.EKODI_OBSERVED_PEAK_RPS_REPOSITORY || '0';
const output = process.argv.find(value => value.startsWith('--output='))?.slice(9) || '';
const chosen = pickRps(explicitRps, repositoryRps, 0);

async function publish(report) {
  console.log(JSON.stringify(report, null, 2));
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `observed_rps=${report.observedPeakRps || 0}\nsource=${report.source}\n`, 'utf8');
  }
}
