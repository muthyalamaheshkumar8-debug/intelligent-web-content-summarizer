const crypto = require('node:crypto');

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  // Render provides the HTTPS origin at runtime; custom domains can override it.
  const clientOrigin = env.CLIENT_ORIGIN || env.RENDER_EXTERNAL_URL;
  const required = ['MONGODB_URI', 'GEMINI_API_KEY'];
  if (production) required.push('SESSION_SECRET', 'SCRAPER_TOKEN');
  for (const name of required) {
    if (!env[name] || /^(your_|replace_)/i.test(env[name]))
      throw new Error(`Configure ${name} before starting the API.`);
  }
  if (production && !clientOrigin)
    throw new Error('Configure CLIENT_ORIGIN before starting the API.');
  if (production && env.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (production && env.SCRAPER_TOKEN.length < 32)
    throw new Error('SCRAPER_TOKEN must contain at least 32 characters.');
  const origins = (
    clientOrigin ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000'
  )
    .split(',')
    .map((value) => value.trim());
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      parsed.origin !== origin ||
      (production && parsed.protocol !== 'https:')
    )
      throw new Error(
        'CLIENT_ORIGIN must contain exact origins (HTTPS in production).',
      );
  }
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
  if (!/^[a-zA-Z0-9.-]+$/.test(model)) throw new Error('Invalid GEMINI_MODEL.');
  const fallbackModel = env.GEMINI_FALLBACK_MODEL ||
    (model === 'gemini-3.8-flash' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash');
  if (!/^[a-zA-Z0-9.-]+$/.test(fallbackModel))
    throw new Error('Invalid GEMINI_FALLBACK_MODEL.');
  const port = Number(env.PORT || 5000);
  const trustProxy = Number(env.TRUST_PROXY || 0);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(trustProxy) ||
    trustProxy < 0
  )
    throw new Error('Invalid PORT or TRUST_PROXY.');
  return {
    production,
    origins,
    port,
    trustProxy,
    model,
    fallbackModel,
    mongoUri: env.MONGODB_URI,
    geminiKey: env.GEMINI_API_KEY,
    scraperUrl: env.SCRAPER_URL || 'http://127.0.0.1:5001',
    scraperToken: env.SCRAPER_TOKEN || '',
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  };
}

module.exports = { loadConfig };
