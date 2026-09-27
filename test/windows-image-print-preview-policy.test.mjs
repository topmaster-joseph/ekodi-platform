import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [policyRaw, agent, api, admin] = await Promise.all([
  readFile(new URL('../config/windows-image-print-preview-policy.json', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../device-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
]);
const policy = JSON.parse(policyRaw);
const commands = ['printing.image_preview.status','printing.image_preview.repair','printing.image_preview.restore'];

test('Windows image print preview policy is enforced and reversible', () => {
  assert.equal(policy.id, 'EKODI-WINDOWS-IMAGE-PRINT-PREVIEW-001');
  assert.equal(policy.status, 'enforced');
  assert.equal(policy.desiredState.previewBeforeFinalPrint, true);
  assert.equal(policy.execution.autoReconcileEnabledAfterRepair, true);
  assert.equal(policy.safety.userHiveOnly, true);
  assert.equal(policy.safety.machineWideRegistryMutationForbidden, true);
  assert.equal(policy.safety.backupBeforeFirstMutation, true);
  assert.equal(policy.safety.reversible, true);
});

test('device control, admin and Windows agent expose bounded print preview commands', () => {
  for (const command of commands) {
    assert.ok(api.includes(`'${command}'`), `API missing ${command}`);
    assert.ok(agent.includes(`'${command}'`), `Agent missing ${command}`);
    assert.ok(admin.includes(`'${command}'`), `Admin missing ${command}`);
  }
  assert.ok(agent.includes('imagePrintPreview = $true'));
});

test('repair is user-hive only, backed up, verified and continuously reconciled after opt-in', () => {
  const start = agent.indexOf('function Repair-ImagePrintPreview');
  const end = agent.indexOf('function Restore-ImagePrintPreview');
  assert.ok(start >= 0 && end > start);
  const repair = agent.slice(start, end);
  assert.ok(agent.includes("HKCU:\\Software\\Classes\\SystemFileAssociations\\image\\shell\\print"));
  assert.ok(repair.includes('Ensure-ImagePrintPreviewBackup'));
  assert.ok(repair.includes('Get-ImagePrintPreviewState'));
  assert.ok(repair.includes('image_print_preview_verification_failed'));
  assert.doesNotMatch(repair, /HKLM:|HKEY_LOCAL_MACHINE/);
  assert.match(agent, /Reconcile-ImagePrintPreviewPolicy\s*\n\s*Poll-Command/);
  assert.match(agent, /\{60fd46de-f830-4894-a628-6fa81bc0190d\}/i);
});
