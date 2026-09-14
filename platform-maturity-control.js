import maturityModel from './governance/standards/ekodi-international-maturity-model.json' with { type: 'json' };
import currentMaturity from './governance/standards/ekodi-current-maturity.json' with { type: 'json' };
import historyIndex from './governance/standards/history/index.json' with { type: 'json' };
import ecosystemServices from './config/ecosystem-services.json' with { type: 'json' };
import siteLifecycleRegistry from './config/site-lifecycle-registry.json' with { type: 'json' };
import serviceWorkspacePolicy from './config/service-workspace-policy.json' with { type: 'json' };
import capabilityRegistry from './config/capability-registry.json' with { type: 'json' };

const finiteScore = value => Number.isFinite(Number(value)) ? Number(value) : null;

function subordinateScopeProjection() {
  const services = (ecosystemServices.services || []).map(service => ({
    id: String(service.id || ''),
    name: String(service.name || service.id || ''),
    scopeType: 'service',
    category: String(service.category || ''),
    lifecycleStatus: String(service.status || 'unknown'),
    productionVerified: service.productionVerified === true,
    evidenceState: service.productionVerified === true ? 'production-verified' : 'local-evidence-required',
    localAssessmentState: 'not-assessed',
    localMaturityScore: null,
  })).filter(item => item.id);

  const workspaceSites = (siteLifecycleRegistry.existingWorkspaceSites || []).map(site => ({
    id: String(site.id || ''),
    name: String(site.name || site.id || ''),
    scopeType: 'workspace-site',
    ownerKind: String(site.ownerKind || ''),
    siteClass: String(site.class || ''),
    migrationState: String(site.migrationState || 'unknown'),    evidenceState: 'registry-evidence-only',
    localAssessmentState: 'not-assessed',
    localMaturityScore: null,
  })).filter(item => item.id);

  const systemFunctions = (capabilityRegistry.capabilities || []).map(capability => ({
    id: String(capability.id || ''),
    name: String(capability.name || capability.id || ''),
    scopeType: 'system-function',
    domain: String(capability.domain || ''),
    actionTier: String(capability.actionTier || ''),
    implementationMaturity: String(capability.maturity || 'unknown'),
    evidenceState: capability.maturity === 'service-backed' || capability.maturity === 'service-backed-readonly' ? 'service-backed' : 'contract-evidence',
    localAssessmentState: 'not-assessed',
    localMaturityScore: null,
    surfaces: Array.isArray(capability.surfaces) ? capability.surfaces.map(String) : [],
    showroomServiceId: String(capability.showroom?.serviceId || ''),
  })).filter(item => item.id);

  const verifiedServices = services.filter(item => item.productionVerified).length;
  const liveServices = services.filter(item => item.lifecycleStatus === 'live').length;
  return {
    schemaVersion: '1.1.0',
    policy: {
      platformControls: 'inherited-by-scope',
      localAssessment: 'evidence-required-before-score',
      numericScorePolicy: 'no-local-score-without-evidence',
      certificationStatus: currentMaturity.certificationStatus,
      platformExternalServiceMode: serviceWorkspacePolicy.serviceAdministrationPolicy?.platformSuperAdministrator?.externalServiceMode || 'directory-observe-audit-and-explicit-intervention',
      localOperationalSourceOfTruth: serviceWorkspacePolicy.serviceAdministrationPolicy?.externalServiceAndSite?.operationalSourceOfTruth || 'service-or-site-admin-surface',
    },
    summary: {
      services: services.length,
      liveServices,
      productionVerifiedServices: verifiedServices,
      servicesRequiringLocalEvidence: services.length - verifiedServices,
      workspaceSites: workspaceSites.length,
      workspaceSitesRequiringLocalEvidence: workspaceSites.length,
      systemFunctions: systemFunctions.length,
      serviceBackedFunctions: systemFunctions.filter(item => item.evidenceState === 'service-backed').length,
      functionsRequiringLocalEvidence: systemFunctions.length,
      totalScopes: services.length + workspaceSites.length + systemFunctions.length,
    },
    services,
    workspaceSites,
    systemFunctions,
  };
}

export function platformMaturityProjection() {
  const history = (historyIndex.snapshots || []).map(entry => ({
    date: String(entry.date || ''),
    overall: finiteScore(entry.overall),
  })).filter(entry => entry.date && entry.overall !== null);
  return {
    schemaVersion: '1.0.0',
    assessmentDate: currentMaturity.assessmentDate,
    certificationStatus: currentMaturity.certificationStatus,
    model: maturityModel,
    current: currentMaturity,
    history,
    serviceScopes: subordinateScopeProjection(),
  };
}
