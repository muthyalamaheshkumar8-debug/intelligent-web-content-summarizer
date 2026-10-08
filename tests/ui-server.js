// Deterministic test fixture, never used by development or production startup.
const { setTimeout: delay } = require('node:timers/promises');
const { fixture, article, generated, AppError } = require('./helpers/fixtures');
const { createSummarizationService } = require('../server/services/summarizationService');
const { app } = fixture({
  config: {
    origins: ['http://127.0.0.1:5050'],
    production: false,
    // Test clients supply distinct source IPs so the real limiter is isolated.
    // This fixture listens on loopback only; production uses server/server.js.
    trustProxy: 1,
    sessionSecret: 'isolated-browser-test-session-secret-123456789',
  },
  scrapeArticle: async (url) => {
    await delay(300);
    if (url.includes('/protected'))
      throw new AppError(
        422,
        'NO_CONTENT',
        'This page is protected. Try another public article.',
      );
    return url.includes('/outage') ? { ...article, title: 'Provider outage article' } : article;
  },
  generateSummary: createSummarizationService({}, async (_text, title) => {
    await delay(300);
    if (title === 'Provider outage article')
      throw new AppError(503, 'AI_UNAVAILABLE', 'Unavailable');
    return generated;
  }),
});
const server = app.listen(5050, '127.0.0.1');
process.on('SIGTERM', () => {
  app.locals.events.close();
  server.close(() => process.exit(0));
});
