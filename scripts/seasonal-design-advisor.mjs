import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

const policy = await readJson('config/seasonal-design-governance.json');
const dna = await readJson('config/user-ui-dna.json');

const args = process.argv.slice(2);
const valueOf = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const dateText = valueOf('--date') || new Date().toISOString().slice(0, 10);
const serviceFilter = valueOf('--service');
const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
if (!match) {
  console.error('Use --date YYYY-MM-DD');
  process.exit(2);
}

const month = Number(match[2]);
const seasonEntry = Object.entries(policy.calendarSeasons).find(([, value]) => value.months.includes(month));
if (!seasonEntry) throw new Error(`No configured season for month ${month}`);
const [season, seasonConfig] = seasonEntry;

const intensityFor = weight => ({ none: 'none', low: 'subtle', medium: 'moderate', high: 'expressive' }[weight] || 'subtle');
const actionFor = servicePolicy => {
  if (servicePolicy.seasonWeight === 'none' || !servicePolicy.autoStage) return 'observe_and_report_only';
  if (servicePolicy.autoProductionMinor) return 'stage_verify_and_guarded_auto_minor';
  return 'stage_verify_and_request_admin_approval';
};

const services = Object.entries(dna.services || {})
  .filter(([id]) => !serviceFilter || id === serviceFilter)
  .map(([id, visualDna]) => {
    const servicePolicy = policy.servicePolicies[id] || policy.servicePolicies.default;
    return {
      service: id,
      date: dateText,
      timezone: policy.timezone,
      season,
      seasonIntent: seasonConfig.intent,
      visualFamily: visualDna.family,
      baseMood: visualDna.mood,
      basePalette: visualDna.palette,
      seasonalIntensity: intensityFor(servicePolicy.seasonWeight),
      priorityContext: servicePolicy.priorityContext || 'service_identity',
      proposedChangeClass: 'minor_reversible',
      action: actionFor(servicePolicy),
      protected: servicePolicy.protected || [],
      requirements: policy.changeClasses.minor_reversible.requirements,
      note: servicePolicy.notes || null,
      providerIndependentFallback: servicePolicy.seasonWeight === 'none'
        ? 'keep_current_surface'
        : 'reuse_existing_approved_assets_or_keep_current_surface'
    };
  });

if (serviceFilter && services.length === 0) {
  console.error(`Unknown service: ${serviceFilter}`);
  process.exit(2);
}

console.log(JSON.stringify({
  generatedBy: 'EKODI seasonal design advisor',
  mode: 'deterministic_core',
  date: dateText,
  timezone: policy.timezone,
  season,
  seasonIntent: seasonConfig.intent,
  services,
}, null, 2));
