import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('doctor inspects local AI node without pairing, network enrollment or secret exposure',()=>{
  const script=fileURLToPath(new URL('../scripts/ai-account-node.mjs',import.meta.url));
  const text=execFileSync(process.execPath,[script,'--doctor'],{
    encoding:'utf8',timeout:40000,env:{
      ...process.env,
      EKODI_ENABLE_CLAUDE_CODE:'false',
      EKODI_CLAUDE_INTERNAL_ONLY:'false',
      EKODI_ENABLE_OLLAMA_LOCAL:'false',
      EKODI_ENABLE_GEMINI_CLI:'false',
    }
  });
  const status=JSON.parse(text);
  assert.equal(typeof status.paired,'boolean');
  assert.equal(typeof status.schedulerEligible,'boolean');
  assert.equal(typeof status.freeMemoryMiB,'number');
  assert.equal(typeof status.cpuLoadPct,'number');
  assert.equal(typeof status.memoryUsedPct,'number');
  assert.equal(status.ollamaReady,false);
  assert.equal(status.claudeInternalReady,false);
  assert.match(status.controlOrigin,/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i);
  assert.deepEqual(Object.keys(status).sort(),[
    'nodeId','controlOrigin','paired','availableProviders','schedulerEligible',
    'cpuLoadPct','memoryUsedPct','freeMemoryMiB',
    'ollamaEnabled','ollamaReady','claudeInternalReady','isPortable'
  ].sort());
  assert.doesNotMatch(text,/nodeToken|bearer|accessToken|refreshToken|apiKey|email/i);
});
