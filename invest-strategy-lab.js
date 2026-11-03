// EKODI Invest · AI 전략 연구실 (Strategy Lab)
//
// Compares the built-in strategies on DETERMINISTIC SYNTHETIC market paths only:
// walk-forward (in-sample fixed, out-of-sample judged) against a buy-and-hold
// benchmark, five stress regimes, and the governed acceptance criteria.
// No market data is fetched and nothing here is a recommendation or an order.
// Results are research evidence for the owner, labelled as synthetic everywhere.
import {
  STRATEGIES, walkForwardEvaluate, stressTestStrategy, evaluateStrategyAcceptance, runBacktest,
  syntheticRegime, DEFAULT_ACCEPTANCE,
} from './invest-autopilot-core.js';

export const STRATEGY_LAB_SCHEMA = 'ekodi.invest.strategy-lab.v1';
export const LAB_ASSUMPTIONS = Object.freeze({
  feeRate: 0.00015, slippageBps: 10, rebalanceEvery: 21, initialCash: 10_000_000,
  universe: [
    { symbol: 'GROWTH', label: '성장 자산 (주식형 ETF 가정)', weight: 0.6 },
    { symbol: 'BOND', label: '안정 자산 (채권형 ETF 가정)', weight: 0.3 },
  ],
  cashWeight: 0.1,
  taxModel: 'not_modelled',
  dataBasis: 'synthetic',
});
const REGIME_LABEL = Object.freeze({ bull: '상승장', bear: '하락장', sideways: '횡보장', crash: '급락', recovery: '회복장' });
const FAILURE_LABEL = Object.freeze({
  no_out_of_sample: '검증 구간 결과 없음',
  oos_sharpe_low: '검증 구간 위험 대비 수익(샤프) 기준 미달',
  oos_drawdown_exceeds_limit: '검증 구간 최대 낙폭이 손실 한도 초과',
  profit_factor_low: '이익/손실 비율 기준 미달',
  underperforms_benchmark: '단순 보유 대비 5%p 이상 저조',
  stress_scenarios_insufficient: '스트레스 시나리오 부족',
  paper_period_insufficient: '모의운용 기간 60일 미만',
  paper_limit_violations: '모의운용 중 한도 위반',
});
const failureLabel = code => FAILURE_LABEL[code] ||
  (code.startsWith('stress_drawdown_') ? `${REGIME_LABEL[code.slice(16)] || code.slice(16)} 시나리오 낙폭 과다` : code);

// Three years of a mixed path: sideways -> bull -> bear; the out-of-sample window spans the late bull into the bear.
export function labMarket(days = 252) {
  const stitch = (names, seed) => {
    const out = [];
    names.forEach((name, i) => {
      const seg = syntheticRegime(name, days, seed + i * 13);
      const scale = out.length ? out[out.length - 1] / seg[0] : 1;
      for (const v of (out.length ? seg.slice(1) : seg)) out.push(v * scale);
    });
    return out;
  };
  const growth = stitch(['sideways', 'bull', 'bear'], 101);
  const bondRaw = stitch(['sideways', 'sideways', 'sideways'], 211);
  // Bonds: same shape family, damped to roughly a third of the equity volatility.
  const bond = bondRaw.map((v, i) => 100 * (1 + (v / bondRaw[0] - 1) * 0.35) * (1 + 0.02 * i / 252));
  return { GROWTH: growth, BOND: bond };
}

const round = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x)) ? null : Number(x.toFixed(d));
const metricView = m => m ? {
  totalReturn: round(m.totalReturn), cagr: round(m.cagr), annualVol: round(m.annualVol), maxDrawdown: round(m.maxDrawdown),
  sharpe: round(m.sharpe, 2), profitFactor: Number.isFinite(m.profitFactor) ? round(m.profitFactor, 2) : null, days: m.days,
} : null;
function sampleCurve(equity, points = 48) {
  if (!equity?.length) return [];
  const step = Math.max(1, Math.floor(equity.length / points));
  const out = [];
  for (let i = 0; i < equity.length; i += step) out.push(Math.round(equity[i]));
  if (out[out.length - 1] !== Math.round(equity[equity.length - 1])) out.push(Math.round(equity[equity.length - 1]));
  return out;
}

export function buildStrategyLab({ policy = {}, paperDays = 0, paperLimitViolations = 0, now = Date.now() } = {}) {
  const prices = labMarket();
  const weights = Object.fromEntries(LAB_ASSUMPTIONS.universe.map(u => [u.symbol, u.weight]));
  const opts = { feeRate: LAB_ASSUMPTIONS.feeRate, slippageBps: LAB_ASSUMPTIONS.slippageBps, rebalanceEvery: LAB_ASSUMPTIONS.rebalanceEvery, initialCash: LAB_ASSUMPTIONS.initialCash };
  const benchmark = { id: 'buy_and_hold', weights, };
  const len = Math.min(...Object.values(prices).map(s => s.length));
  const split = Math.floor(len * 0.6);
  const benchOos = runBacktest({ prices, strategy: benchmark, ...opts, rebalanceEvery: len + 1, start: split, end: len });
  const strategies = Object.values(STRATEGIES).map(def => {
    const strategy = { ...def, weights };
    const wf = walkForwardEvaluate({ prices, strategy, benchmark: { ...benchmark }, ...opts });
    wf.benchmark = benchOos.metrics; // judge against true buy-and-hold, not a rebalanced copy
    const oosRun = runBacktest({ prices, strategy, ...opts, start: split, end: len });
    const stress = stressTestStrategy(strategy, opts);
    const acceptance = evaluateStrategyAcceptance({ walkForward: wf, stress, paper: { days: paperDays, limitViolations: paperLimitViolations }, policy });
    return {
      id: def.id, label: def.label,
      inSample: metricView(wf.inSample), outOfSample: metricView(wf.outOfSample),
      costs: Math.round(wf.costs), trades: wf.trades,
      stress: stress.map(s => ({ name: s.name, label: REGIME_LABEL[s.name] || s.name, totalReturn: round(s.metrics.totalReturn), maxDrawdown: round(s.metrics.maxDrawdown) })),
      curve: sampleCurve(oosRun.equity),
      acceptance: { passed: acceptance.passed, failures: acceptance.failures.map(code => ({ code, label: failureLabel(code) })) },
    };
  });
  const ranked = [...strategies].sort((a, b) => (b.outOfSample?.sharpe ?? -9) - (a.outOfSample?.sharpe ?? -9));
  return {
    schema: STRATEGY_LAB_SCHEMA, generatedAt: new Date(now).toISOString(),
    dataBasis: 'synthetic', dataLabel: '합성(가상) 시장 데이터 · 실제 시세 아님',
    split: { inSampleDays: split, outOfSampleDays: len - split },
    assumptions: {
      ...LAB_ASSUMPTIONS,
      notes: ['수수료 0.015%, 슬리피지 0.1%, 21거래일마다 리밸런싱', '세금·배당·환율은 반영하지 않음 (확인필요)', '현금 10%는 운용하지 않음', '과거·가상 성과는 미래 수익을 보장하지 않음'],
    },
    criteria: { ...DEFAULT_ACCEPTANCE, maxDrawdownPct: policy.totalLossLimitPct ?? 20 },
    benchmark: { label: '단순 보유 (리밸런싱 없음)', outOfSample: metricView(benchOos.metrics), curve: sampleCurve(benchOos.equity) },
    strategies, bestByOutOfSampleSharpe: ranked[0]?.id || null,
    uncertainty: '가상 경로 1개와 시나리오 5개에 근거한 비교입니다. 실제 시장에서는 결과가 크게 다를 수 있으며 매매 권유가 아닙니다.',
    recommendation: null, ordersPlaced: false, liveOrdersEnabled: false,
  };
}
