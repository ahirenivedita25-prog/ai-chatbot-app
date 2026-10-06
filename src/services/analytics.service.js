const events = [];
const inferenceDurations = [];

function track(event, properties = {}) {
  events.push({ event, properties, timestamp: new Date().toISOString() });
}

function summary() {
  return events.reduce((result, item) => {
    result[item.event] = (result[item.event] || 0) + 1;
    return result;
  }, {});
}

function trackInferenceDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  inferenceDurations.push(durationMs);
  if (inferenceDurations.length > 500) inferenceDurations.shift();
}

function performanceSummary() {
  const sorted = [...inferenceDurations].sort(
    (first, second) => first - second,
  );
  return {
    samples: sorted.length,
    averageMs: sorted.length
      ? Math.round(
          sorted.reduce((total, value) => total + value, 0) / sorted.length,
        )
      : null,
    p95Ms: sorted.length
      ? Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1])
      : null,
  };
}

module.exports = { track, summary, trackInferenceDuration, performanceSummary };
