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

export function telemetryWindow(now = new Date(), lookbackHours = 24, lagMinutes = 5) {
  const hours = Math.max(1, Math.min(168, Number(lookbackHours) || 24));
  const lag = Math.max(0, Math.min(60, Number(lagMinutes) || 0));
  const end = new Date(now.getTime() - lag * 60000);
  const start = new Date(end.getTime() - hours * 3600000);
  return { start: start.toISOString(), end: end.toISOString(), lookbackHours: hours, lagMinutes: lag };
}
