(() => {
  'use strict';
  if (window.EKODIAdminPerf) return;

  const state = {
    longTasks: [],
    resources: [],
    paints: [],
    layoutShifts: [],
    events: [],
    navigation: performance.getEntriesByType('navigation')[0]?.toJSON?.() || null,
  };

  for (const entry of performance.getEntriesByType('paint')) {
    state.paints.push({ name:entry.name, start:entry.startTime });
  }

  function pushEntry(entry) {
    if (entry.entryType === 'longtask') state.longTasks.push({ start:entry.startTime, duration:entry.duration });
    if (entry.entryType === 'resource') state.resources.push({
      name:entry.name,
      initiatorType:entry.initiatorType,
      start:entry.startTime,
      duration:entry.duration,
      transferSize:entry.transferSize || 0,
      encodedBodySize:entry.encodedBodySize || 0,
    });
    if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
      state.layoutShifts.push({ start:entry.startTime, value:entry.value });
    }
    if (entry.entryType === 'event' && entry.duration >= 16) {
      state.events.push({ name:entry.name, start:entry.startTime, duration:entry.duration, interactionId:entry.interactionId || 0 });
    }
  }

  const observers = [];
  try {
    for (const type of ['longtask', 'resource', 'layout-shift']) {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      const observer = new PerformanceObserver(list => list.getEntries().forEach(pushEntry));
      observer.observe({ type, buffered:true });
      observers.push(observer);
    }
    if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
      const observer = new PerformanceObserver(list => list.getEntries().forEach(pushEntry));
      observer.observe({ type:'event', buffered:true, durationThreshold:16 });
      observers.push(observer);
    }
  } catch (error) {
    console.warn('[EKODI perf] observer setup failed', error);
  }

  function snapshot() {
    const resources = [...state.resources];
    const marks = performance.getEntriesByType('mark').map(entry => ({ name:entry.name, start:entry.startTime }));
    const measures = performance.getEntriesByType('measure').map(entry => ({ name:entry.name, start:entry.startTime, duration:entry.duration }));
    return {
      navigation:state.navigation,
      paints:[...state.paints],
      longTasks:[...state.longTasks],
      layoutShifts:[...state.layoutShifts],
      events:[...state.events],
      resources,
      resourceCount:resources.length,
      transferBytes:resources.reduce((sum, item) => sum + Number(item.transferSize || 0), 0),
      longTaskMs:state.longTasks.reduce((sum, item) => sum + Number(item.duration || 0), 0),
      cls:state.layoutShifts.reduce((sum, item) => sum + Number(item.value || 0), 0),
      marks,
      measures,
    };
  }

  function report() {
    const data = snapshot();
    console.info('[EKODI perf]', data);
    return data;
  }

  window.EKODIAdminPerf = Object.freeze({ snapshot, report, disconnect:() => observers.forEach(observer => observer.disconnect()) });
  window.addEventListener('ekodi-admin-ready', () => queueMicrotask(report), { once:true });
})();

// Release marker: shared admin sidebar production rollout, final gate 2026-08-26.
