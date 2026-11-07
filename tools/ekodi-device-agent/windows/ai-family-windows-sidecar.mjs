// EKODI user-mode sidecar composition. No entrypoint, no autostart, no network.
// A privileged Windows Device Agent is NOT an allowed host for this module.
import {createWindowsFamilyPreflight} from './ai-family-windows-preflight.mjs';
import {createNativeFamilyRunner} from './ai-family-native-runner.mjs';

export function createWindowsNativeFamilySidecar({broker={},leaseClient={},preflightOptions={},runnerOptions={}}={}){
  const preflight=createWindowsFamilyPreflight(preflightOptions);
  return createNativeFamilyRunner({
    ...runnerOptions,
    getSignedConsent:broker.getSignedConsent?.bind(broker),
    verifySignedConsent:broker.verifySignedConsent?.bind(broker),
    renewLease:leaseClient.renewLease?.bind(leaseClient),
    isNonElevatedWindowsUser:preflight.isNonElevatedWindowsUser,
    verifyCliOAuth:preflight.verifyCliOAuth,
    terminateProcessTree:preflight.terminateProcessTree,
  });
}
