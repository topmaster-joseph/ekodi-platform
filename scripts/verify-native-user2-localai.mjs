// Official USER2-only bounded Ollama acceptance. Requires receipt-gated workflow and genuine admin session.
import { verifyNativeLocalAi } from './verify-native-localai.mjs';

verifyNativeLocalAi({
  token: process.env.E2E_ADMIN_TOKEN,
  hostname: 'user2',
}).then(proof => {
  console.log('[EKODI][USER2-NATIVE-LOCALAI-CANARY] ' + JSON.stringify(proof));
}).catch(error => {
  console.error('[EKODI][USER2-NATIVE-LOCALAI-CANARY] ' + String(error?.message || 'verification_failed').slice(0,100));
  process.exitCode = 1;
});
