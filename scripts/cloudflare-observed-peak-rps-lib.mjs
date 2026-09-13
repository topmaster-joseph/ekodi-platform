export function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function peakRpsFromMinuteRows(rows = []) {
  let peakRequestsPerMinute = 0;
  let peakMinute = null;
  let sampleMinutes = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const requests = Number(row?.sum?.requests ?? row?.requests ?? 0);
    if (!Number.isFinite(requests) || requests < 0) continue;
    sampleMinutes += 1;
    if (requests > peakRequestsPerMinute) {
      peakRequestsPerMinute = requests;
      peakMinute = row?.dimensions?.datetimeMinute || row?.datetimeMinute || null;
    }
  }
  return {
    observedPeakRps: peakRequestsPerMinute > 0 ? Math.round((peakRequestsPerMinute / 60) * 1000) / 1000 : 0,
    peakRequestsPerMinute,
    peakMinute,
    sampleMinutes
  };
}
