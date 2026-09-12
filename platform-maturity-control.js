import maturityModel from './governance/standards/ekodi-international-maturity-model.json' with { type: 'json' };
import currentMaturity from './governance/standards/ekodi-current-maturity.json' with { type: 'json' };
import historyIndex from './governance/standards/history/index.json' with { type: 'json' };

const finiteScore = value => Number.isFinite(Number(value)) ? Number(value) : null;

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
  };
}
