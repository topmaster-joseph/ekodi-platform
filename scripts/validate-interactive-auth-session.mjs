#!/usr/bin/env node
// Hard gate for EKODI-INTERACTIVE-AUTH-001. Fails closed if the human-in-the-loop
// login capability drifts from its privacy contract or if it weakens the
// unchanged EKODI-BROWSER-WORKER-001 background worker policy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTERACTIVE_AUTH_POLICY_ID,
  INTERACTIVE_AUTH_SERVICES,
  INTERACTIVE_AUTH_DEFAULT_TTL_MINUTES,
  INTERACTIVE_AUTH_MAX_TTL_MINUTES,
  INTERACTIVE_AUTH_COMMANDS,
} from '../interactive-auth-session.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const errors = [];
const must = (condition, message) => { if (!condition) errors.push(message); };

const policy = JSON.parse(read('config/interactive-auth-session-policy.json'));
must(policy.policyId === INTERACTIVE_AUTH_POLICY_ID, 'policy id mismatch');
must(policy.constitutionalBasis?.automaticExecution === false, 'interactive auth must never be automatic execution');
must(policy.constitutionalBasis?.foregroundException === 'oauth-or-provider-consent', 'foreground basis must be provider consent');
must(policy.session?.defaultTtlMinutes === INTERACTIVE_AUTH_DEFAULT_TTL_MINUTES, 'default TTL drift');
must(policy.session?.maxTtlMinutes === INTERACTIVE_AUTH_MAX_TTL_MINUTES && INTERACTIVE_AUTH_MAX_TTL_MINUTES <= 60, 'max TTL drift');
must(policy.authority?.autoAssignedJobsForbidden === true, 'auto-assigned jobs must be forbidden');
for (const key of ['activeUserProfileReuse', 'passwordManagerEnabled', 'clipboardShared', 'hostInputInjection', 'screenCapture']) {
  must(policy.isolation?.[key] === false, `isolation.${key} must be false`);
}
must((policy.isolation?.forbiddenBrowsers || []).includes('opera'), 'opera must be forbidden');
for (const key of ['passwordRelay', 'otpRelay', 'cookieExport', 'storageStateExport', 'sentToAiModel', 'loggedOrCaptured', 'ekodiRendersPasswordFields']) {
  must(policy.credentials?.[key] === false, `credentials.${key} must be false`);
}
for (const key of ['mutation', 'uploads', 'creditConsumingActions']) must(policy.verification?.[key] === false, `verification.${key} must be false`);
must(policy.verification?.menuVisibleIsNotExecutionVerified === true, 'menu visibility must not imply execution');
for (const [id, svc] of Object.entries(policy.services || {})) {
  const mod = INTERACTIVE_AUTH_SERVICES[id];
  must(mod, `service ${id} missing from module registry`);
  if (!mod) continue;
  must(svc.entryUrl === mod.entryUrl && svc.automationOrigin === mod.automationOrigin, `service ${id} URL drift`);
  must(new URL(mod.entryUrl).origin === mod.automationOrigin && mod.automationOrigin.startsWith('https://'), `service ${id} entry must be https on its own origin`);
}
must(Object.keys(INTERACTIVE_AUTH_SERVICES).length === Object.keys(policy.services || {}).length, 'service registry count drift');

// The background worker contract must stay exactly as strict as before.
const worker = JSON.parse(read('config/background-browser-worker-policy.json'));
must(worker.originPolicy?.canonicalOriginOnly === true, 'background worker canonicalOriginOnly weakened');
must(worker.executionLifecycle?.authRequiredMustNotOpenInteractiveLogin === true, 'background worker interactive-login prohibition weakened');
must(worker.isolation?.activeUserProfileReuseForbidden === true, 'background worker profile reuse prohibition weakened');
must(!read('scripts/ekodi-background-browser-worker.mjs').includes('factchat'), 'background worker must not target external services');

// Control API binding.
const control = read('device-control.js');
for (const type of Object.values(INTERACTIVE_AUTH_COMMANDS)) must(control.includes(type) || control.includes('INTERACTIVE_AUTH_COMMANDS'), `device-control missing ${type}`);
must(/INTERACTIVE_AUTH_SUPER_ADMIN_REQUIRED/.test(control), 'super admin gate missing');
must(/INTERACTIVE_AUTH_JOB_FORBIDDEN/.test(control), 'auto-job prohibition missing');
must(/assessInteractiveAuthReceipt\(/.test(control), 'receipt assessment missing');
must(/sanitizeInteractiveAuthSettings\(body\.settings\)/.test(control), 'heartbeat settings projection missing');

// Device Agent binding: isolate the interactive auth section and scan it.
const agent = read('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1');
const start = agent.indexOf('# EKODI-INTERACTIVE-AUTH-001');
const end = agent.indexOf('function Get-WindowsOptionalFeatureStateSafe', start);
must(start > 0 && end > start, 'agent interactive auth section missing');
const section = agent.slice(start, end);
for (const forbidden of ['Network.getCookies', 'Network.getAllCookies', 'Storage.getCookies', 'Page.captureScreenshot', 'Page.startScreencast',
  'Input.dispatch', 'SendKeys', 'Set-Clipboard', 'Get-Clipboard', 'opera.exe', 'localStorage', 'sessionStorage', 'document.cookie', '--headless']) {
  must(!section.includes(forbidden), `agent interactive auth section must not contain ${forbidden}`);
}
for (const required of ['Request-EkodiInteractiveAuthLocalConsent', 'WScript.Shell', '--remote-debugging-address=127.0.0.1', 'credentials_enable_service":false',
  'Close-EkodiInteractiveAuthSessionCore', 'Reconcile-EkodiInteractiveAuthSession', 'interactive_auth_origin_mismatch']) {
  must(section.includes(required), `agent interactive auth section must contain ${required}`);
}
must(/'computer\.auth_session\.start' \{ return Start-EkodiInteractiveAuthSession \$payload \}/.test(agent), 'agent dispatch start missing');
must(/Reconcile-EkodiInteractiveAuthSession\)/.test(agent.slice(agent.indexOf('function Run-Agent'))), 'agent loop reconcile missing');

if (errors.length) {
  console.error(`EKODI-INTERACTIVE-AUTH-001 validation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`EKODI-INTERACTIVE-AUTH-001 validation passed (${Object.keys(INTERACTIVE_AUTH_SERVICES).length} service).`);
