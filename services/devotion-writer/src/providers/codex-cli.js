import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const cleanJson = text => String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

function run(args, stdin, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: process.platform === 'win32' });
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Codex writer timed out')); }, timeoutMs);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Codex writer exited ${code}: ${stderr.slice(-1500)}`));
    });
    child.stdin.end(stdin);
  });
}

export function createCodexCliWriterProvider({ enabled = false, model = '' } = {}) {
  return {
    id: 'codex-cli',
    ready() { return enabled === true; },
    async generate({ prompt, schema }) {
      if (!enabled) {
        const error = new Error('Codex CLI writer fallback is disabled');
        error.code = 'WRITER_PROVIDER_NOT_CONNECTED';
        throw error;
      }
      const dir = await mkdtemp(join(tmpdir(), 'ekodi-devotion-writer-'));
      const output = join(dir, 'output.json');
      try {
        const instruction = `${prompt}\n\nReturn only JSON matching this schema exactly:\n${JSON.stringify(schema)}`;
        const args = ['exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--output-last-message', output];
        if (model) args.push('-m', model);
        args.push('-');
        await run(args, instruction);
        const data = JSON.parse(cleanJson(await readFile(output, 'utf8')));
        return { data, provider: 'codex-cli', model: model || 'account-default' };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  };
}

