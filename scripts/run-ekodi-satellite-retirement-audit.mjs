#!/usr/bin/env node
/**
 * EKODI Orchestrator-owned satellite source/retirement audit runner.
 *
 * Operates only on checked-in source-of-truth/retirement policy and fixed public
 * Church/Lab release-marker GET endpoints. GitHub Actions supplies compute and
 * an evidence artifact; it is not an independent release or deletion authority.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectCurrentRepositoryRetirements} from './inspect-satellite-repository-retirement.mjs';
import {auditSatelliteLiveSourceMarkers} from './audit-satellite-live-source-markers.mjs';
import {auditPublicLegacyWorkflowRisks} from './audit-public-legacy-workflow-risks.mjs';
import {
  buildSatelliteRetirementWatchReport,
  renderSatelliteRetirementWatchMarkdown
} from './build-satellite-retirement-watch-report.mjs';

const CONTRACT='ekodi.orchestrator-satellite-retirement-audit.v1';
const EKODI='EKODI Orchestrator';
const SOURCE='EKODI Native Operations Watch';
const VALID_RUN_MODES=new Set(['daily','manual']);
const observeFixedPublicMarkers=()=>auditSatelliteLiveSourceMarkers({
  fetcher:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})
});

export function classifyEkodiSatelliteAudit(retirement,markers,{runMode='daily'}={}) {
  if(!VALID_RUN_MODES.has(runMode)) throw Error('invalid-ekodi-satellite-audit-run-mode');
  const report=buildSatelliteRetirementWatchReport(retirement,markers);
  // Neither a green workflow nor two matching public markers constitute a
  // deletion, offsite-restore, provider-binding or signed Human Gate receipt.
  const observedIssues=report.publicLegacyOrUnverified;
  const coverageGaps=report.noPublicMarkerObservation;
  const state=observedIssues>0?'review-required-public-marker-mismatch'
    :coverageGaps>0?'review-required-partial-public-observation'
    :'review-required-independent-gates';
  const result={
    contract:CONTRACT,
    operator:EKODI,
    scheduler:SOURCE,
    runMode,
    mode:'read-only-no-github-provider-or-production-mutations',
    observedAt:markers.checkedAt,
    state,
    fleet:{
      canonicalRepository:report.canonicalRepository,
      registeredSatellites:report.totalRegisteredSatellites,
      publicCanonicalSourceMarkersVerified:report.publicCanonicalMarkerVerified,
      legacyOrUnavailableMarkers:report.publicLegacyOrUnverified,
      notCoveredByPublicMarkers:report.noPublicMarkerObservation,
      reportedRepositories:report.rows.map(row=>({
        repository:row.repository,
        stage:row.stage,
        publicSourceState:row.sourceMarkerStatus,
        missingPreDeletionEvidenceCount:row.missingEvidenceInCurrentAudit.length,
        deletionDecision:'retain'
      }))
    },
    warningReasons:markers.errors.map(String),
    // These booleans must never be derived from a green pipeline alone.
    immutableOffsiteRestoreVerified:false,
    providerBindingsAndCredentialsReconciled:false,
    tenantAuthFinancialRegressionsVerified:false,
    independentRollbackVerified:false,
    repositoryScopedHumanGateSatisfied:false,
    automaticRepositoryDeletionAuthorized:false,
    anyRepositoryDeleted:false,
    releaseOrProductionMutationPerformed:false,
    finalDecision:'retain-all-satellites-requires-independent-owner-gates'
  };
  return{summary:result,retirement,markers,report};
}

export async function collectEkodiSatelliteAudit({
  inspect=inspectCurrentRepositoryRetirements,
  observe=observeFixedPublicMarkers,
  runMode='daily'
}={}) {
  const retirement=await inspect();
  const markers=await observe();
  return classifyEkodiSatelliteAudit(retirement,markers,{runMode});
}

export function renderEkodiSatelliteAuditSummary(audit) {
  return[
    '## EKODI Orchestrator · satellite source and release audit',
    '',
    'Execution authority: **EKODI Orchestrator**. Scheduler: EKODI Native Operations Watch. Runtime mode: '+audit.summary.runMode+'.',
    'Outcome: **'+audit.summary.state+'**. Existing repositories retained: '+audit.summary.fleet.registeredSatellites+'.',
    'Missing or legacy public markers: '+audit.summary.fleet.legacyOrUnavailableMarkers+
      '. Source markers not covered: '+audit.summary.fleet.notCoveredByPublicMarkers+'.',
    '',
    renderSatelliteRetirementWatchMarkdown(audit.report),
    ...(audit.legacyWorkflow ? [
      '### Legacy source writers: public workflow text observation only',
      'Possible remaining legacy publisher/merger workflow files: '+audit.legacyWorkflow.possibleActiveLegacyWriters+'.',
      'No Cloudflare bindings, provider credentials, webhook activity, private repositories, or actual workflow execution were verified.',
      ...audit.legacyWorkflow.repositories.map(row=>'- '+row.repository+': '+row.status),
      ''
    ] : []),
    '',
    'This read-only workflow neither deploys nor authorizes repo deletion, migration, credential revocation, Cloudflare changes or owner Human Gate.',
    ''
  ].join('\n');
}

export async function runEkodiSatelliteAudit({
  runMode='daily',outputDir='ekodi-satellite-audit',
  inspect=inspectCurrentRepositoryRetirements,observe=observeFixedPublicMarkers,
  observeLegacy=auditPublicLegacyWorkflowRisks
}={}) {
  const audit=await collectEkodiSatelliteAudit({inspect,observe,runMode});
  const legacy=await observeLegacy();
  // Static public text must never be conflated with runtime cloud access, or
  // smuggled into the source-retirement decision as an approval receipt.
  if(legacy?.contract!=='ekodi.public-legacy-workflow-risk.v1'||
     legacy.repositoryDeletionAuthorized!==false||legacy.anyRepositoryDeleted!==false||
     legacy.totalRegisteredSatellites!==audit.summary.fleet.registeredSatellites||
     !Array.isArray(legacy.repositories)||
     legacy.repositories.length!==audit.summary.fleet.registeredSatellites||
     legacy.repositories.some((row,i)=>row.repository!==audit.summary.fleet.reportedRepositories[i].repository||
       row.deletionDecision!=='retain')) {
    throw Error('invalid-legacy-workflow-risk-evidence');
  }
  audit.legacyWorkflow=legacy;
  audit.summary.fleet.possibleActiveLegacyWriterFiles=legacy.possibleActiveLegacyWriters;
  audit.summary.fleet.unverifiedLegacyWorkflowRepositories=legacy.unverifiedRepositoryCount;
  // Untrusted source evidence is validated by the report builder before any
  // output artifact is created; an invalid registry fails closed.
  const destination=resolve(outputDir);
  await mkdir(destination,{recursive:true});
  await Promise.all([
    writeFile(resolve(destination,'report.json'),JSON.stringify(audit.summary,null,2)+'\n','utf8'),
    writeFile(resolve(destination,'retirement.json'),JSON.stringify(audit.retirement,null,2)+'\n','utf8'),
    writeFile(resolve(destination,'live-markers.json'),JSON.stringify(audit.markers,null,2)+'\n','utf8'),
    writeFile(resolve(destination,'legacy-workflow-risks.json'),JSON.stringify(audit.legacyWorkflow,null,2)+'\n','utf8'),
    writeFile(resolve(destination,'full-audit.json'),JSON.stringify(audit.report,null,2)+'\n','utf8'),
    writeFile(resolve(destination,'summary.md'),renderEkodiSatelliteAuditSummary(audit),'utf8')
  ]);
  return audit;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2);
  const modeArg=args.find(x=>x.startsWith('--mode='));
  const outputArg=args.find(x=>x.startsWith('--output-dir='));
  const invalid=args.filter(x=>!x.startsWith('--mode=')&&!x.startsWith('--output-dir='));
  if(invalid.length||args.filter(x=>x.startsWith('--mode=')).length>1||
    args.filter(x=>x.startsWith('--output-dir=')).length>1) {
    console.error('Usage: run-ekodi-satellite-retirement-audit.mjs [--mode=daily|manual] [--output-dir=directory]');
    process.exitCode=2;
  }else{
    const runMode=modeArg?.slice('--mode='.length)||'daily';
    const outputDir=outputArg?.slice('--output-dir='.length)||'ekodi-satellite-audit';
    runEkodiSatelliteAudit({runMode,outputDir}).then(audit=>{
      console.log(JSON.stringify({
        contract:audit.summary.contract,operator:audit.summary.operator,
        state:audit.summary.state,repositoryCount:audit.summary.fleet.registeredSatellites,
        finalDecision:audit.summary.finalDecision,
        evidenceDirectory:outputDir
      }));
    }).catch(error=>{
      console.error('ekodi-satellite-audit-fail-closed: '+String(error?.message||'unknown-error'));
      process.exitCode=1;
    });
  }
}
