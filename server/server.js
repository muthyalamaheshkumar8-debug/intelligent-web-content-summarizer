require('dotenv').config({
  path: require('node:path').join(__dirname, '.env'),
});
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const Summary = require('./models/Summary');
const { createScraperService } = require('./services/scraperService');
const { createSummarizationService } = require('./services/summarizationService');
const { log } = require('./utils/logger');

async function start() {
  const config = loadConfig();
  mongoose.set('bufferCommands', false);
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    socketTimeoutMS: 15000,
    waitQueueTimeoutMS: 5000,
    autoIndex: false,
  });
  // Additive index only: existing documents are preserved and never assigned to a stranger.
  await Summary.collection.createIndex({ ownerId: 1, createdAt: -1, _id: -1 });
  const scraper = createScraperService(config);
  const app = createApp({
    config,
    model: Summary,
    scrapeArticle: scraper.scrapeArticle,
    generateSummary: createSummarizationService(config),
    readiness: async () =>
      mongoose.connection.readyState === 1 && (await scraper.healthy()),
  });
  const server = app.listen(config.port, () =>
    log('info', 'server_started', { port: config.port }),
  );
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    log('info', 'server_stopping');
    app.locals.events.close();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  server.on('error', (error) => {
    log('error', 'listen_failed', { code: error.code });
    process.exit(1);
  });
}

if (require.main === module)
  start().catch((error) => {
    log('error', 'startup_failed', {
      errorType: /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(error.name || '')
        ? error.name
        : 'Error',
      databaseCode: Number.isInteger(error.code) ? error.code : undefined,
      authenticationFailed: /bad auth|authentication failed/i.test(error.message || ''),
      message:
        error.name === 'MongooseServerSelectionError'
          ? 'MongoDB is unreachable. Check MONGODB_URI and network access.'
          : 'Check required configuration and database permissions.',
    });
    process.exit(1);
  });
module.exports = { start };
