const events = [];

function track(event, properties = {}) {
  events.push({ event, properties, timestamp: new Date().toISOString() });
}

function summary() {
  return events.reduce((result, item) => {
    result[item.event] = (result[item.event] || 0) + 1;
    return result;
  }, {});
}

module.exports = { track, summary };
