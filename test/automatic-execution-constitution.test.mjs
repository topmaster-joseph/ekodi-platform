import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [constitutionText, remoteText, fabricText, routingText, browserText, hybrid, provider, router, device, agent] = await Promise.all([
  read('governance/constitution/constitution.json'),
  read('config/remote-computer-execution-policy.json'),
  read('config/autonomous-execution-fabric-policy.json'),
  read('config/virtualization-routing-policy.json'),
  read('config/background-browser-worker-policy.json'),
  read('hybrid-execution.js'),
  read('remote-computer-provider.js'),
  read('virtualization-router.js'),
  read('device-control.js'),
  read('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1'),
]);

const constitution = JSON.parse(constitutionText);
const remote = JSON.parse(remoteText);
const fabric = JSON.parse(fabricText);
const routing = JSON.parse(routingText);
const browser = JSON.parse(browserText);
const policy = constitution.automaticExecutionLifecyclePolicy;

test('constitution makes automatic execution background-only mandatory and non-waivable', () => {
  assert.equal(constitution.version, '1.27.0');
  assert.ok(constitution.principles.includes('automatic-execution-background-only-enforced'));
  assert.equal(policy.id, 'AUTOMATIC-EXECUTION-LIFECYCLE-001');
  assert.equal(policy.status, 'enforced');
  assert.equal(policy.mode, 'mandatory');
  assert.equal(policy.appliesToAllCurrentAndFutureAutomaticExecution, true);
  assert.equal(policy.defaultExecutionMode, 'background-only');
  assert.equal(policy.foregroundWindowDefault, false);
  assert.equal(policy.userBrowserTabCreation, false);
  assert.equal(policy.localOverrideForbidden, true);
  assert.equal(policy.serviceOrAgentWaiverForbidden, true);
  assert.equal(policy.policyRegressionBlocksCi, true);
});

test('constitutional lifecycle preserves user surfaces and closes only EKODI-owned automation surfaces', () => {
  assert.equal(policy.ownedAutomationSurfaceAutoClose, true);
  assert.equal(policy.authRequiredDisposition, 'record-and-close');
  assert.equal(policy.authRequiredMustNotOpenInteractiveLogin, true);
  assert.equal(policy.preserveUserOwnedWindowsAndTabs, true);
  assert.equal(policy.temporaryAutomationProfilesMustBeRemoved, true);
  assert.equal(policy.backgroundApiPreferredOverBrowserForApiChecks, true);
  assert.deepEqual(policy.foregroundAllowedOnlyFor, [
    'oauth-or-provider-consent',
    'captcha-or-human-verification',
    'hardware-backed-authentication',
    'os-privileged-consent',
  ]);
});

test('all execution policy layers bind the same constitutional rule', () => {
  assert.equal(remote.constitutionalPolicy, policy.id);
  assert.equal(remote.nonDisruptiveExecution.automaticExecutionLifecycle.constitutionalPolicy, policy.id);
  assert.ok(fabric.constitutionalPolicies.includes(policy.id));
  assert.equal(fabric.automaticExecutionLifecycle.constitutionalPolicy, policy.id);
  assert.ok(routing.constitutionalPolicies.includes(policy.id));
  assert.equal(routing.automaticExecutionLifecycle.constitutionalPolicy, policy.id);
  assert.equal(browser.constitutionalPolicy, policy.id);
  assert.equal(browser.executionLifecycle.constitutionalPolicy, policy.id);
});

test('runtime implementations retain the enforced no-user-tab and cleanup evidence', () => {
  for (const [name, source] of [['hybrid', hybrid], ['provider', provider], ['router', router]]) {
    assert.match(source, /background-only/, name + ' must preserve background-only execution');
  }
  assert.match(hybrid, /createUserBrowserTab:false/);
  assert.match(hybrid, /authRequiredDisposition:'record-and-close'/);
  assert.match(provider, /userBrowserTabCreated === true/);
  assert.match(provider, /ownedSurfaceClosed !== true/);
  assert.match(provider, /userOwnedSurfacesPreserved !== true/);
  assert.match(provider, /interactiveLoginOpened === true/);
  assert.match(router, /userBrowserTabCreation:false/);
  assert.match(router, /ownedSurfaceAutoClose:true/);
  assert.match(router, /preserveUserOwnedSurfaces:true/);
  assert.match(router, /interactiveLoginAllowed:false/);
  assert.match(device, /createUserBrowserTab:false/);
  assert.match(agent, /\$Payload\.createUserBrowserTab -ne \$false/);
  assert.match(agent, /interactiveLoginOpened = \$false/);
  assert.match(agent, /createUserBrowserTab = \$false/);
  assert.match(agent, /ownedAutomationSurfaceAutoClosed = \$true/);
  assert.match(agent, /userOwnedSurfacesPreserved = \$true/);
});

test('automatic execution policy and its validators are constitutionally protected', () => {
  const required = [
    'config/remote-computer-execution-policy.json',
    'config/autonomous-execution-fabric-policy.json',
    'config/virtualization-routing-policy.json',
    'config/background-browser-worker-policy.json',
    'scripts/validate-virtualization-routing.mjs',
    'test/automatic-execution-constitution.test.mjs',
  ];
  for (const path of required) assert.ok(constitution.changeControl.protectedPaths.includes(path), path);
});
