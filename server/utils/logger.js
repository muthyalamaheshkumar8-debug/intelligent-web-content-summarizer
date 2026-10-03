// Deliberately exclude URLs, article text, cookies, headers and provider errors.
function log(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

module.exports = { log };
