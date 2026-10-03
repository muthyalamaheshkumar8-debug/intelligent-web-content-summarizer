const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { sessionMiddleware, protectMutations } = require('./middleware/session');
const errorHandler = require('./middleware/errorHandler');
const { createSummaryRouter } = require('./routes/summaryRoutes');
const { createSummaryController } = require('./controllers/summaryController');
const { createEventService } = require('./services/eventService');
const { AppError } = require('./utils/errors');
const { log } = require('./utils/logger');

function createApp({
  config,
  model,
  scrapeArticle,
  generateSummary,
  readiness = async () => true,
  events = createEventService(),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);
  app.locals.events = events;
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'connect-src': ["'self'", ...config.origins],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'font-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.set('X-Request-Id', req.requestId);
    const start = Date.now();
    res.on('finish', () =>
      log('info', 'http_request', {
        requestId: req.requestId,
        method: req.method,
        status: res.statusCode,
        durationMs: Date.now() - start,
      }),
    );
    next();
  });
  app.use(
    '/api',
    cors({
      origin(origin, callback) {
        if (!origin || config.origins.includes(origin))
          return callback(null, true);
        callback(new AppError(403, 'FORBIDDEN', 'This origin is not allowed.'));
      },
      credentials: true,
      exposedHeaders: ['X-Next-Cursor', 'X-Request-Id', 'Retry-After'],
    }),
  );
  app.get('/api/health', async (req, res, next) => {
    try {
      const ready = await readiness();
      res
        .status(ready ? 200 : 503)
        .json({ status: ready ? 'ok' : 'unavailable' });
    } catch (error) {
      next(error);
    }
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again in a minute.',
      },
    }),
  );
  app.use(
    '/api',
    express.json({ limit: '8kb' }),
    protectMutations(config.origins),
    sessionMiddleware(config),
  );
  app.get('/api/session', (req, res) => res.json({ status: 'ready' }));
  app.get('/api/events', events.subscribe);
  app.use(
    '/api/summaries',
    createSummaryRouter(
      createSummaryController({
        model,
        scrapeArticle,
        generateSummary,
        events,
      }),
    ),
  );
  app.use('/api', (req, res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'API endpoint not found.')),
  );
  const dist = path.resolve(__dirname, '../client/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        maxAge: '1h',
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`))
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('/', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((req, res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'Page not found.')),
  );
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
