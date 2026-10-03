const express = require('express');
const { rateLimit } = require('express-rate-limit');

function createSummaryRouter(controller) {
  const router = express.Router();
  router.post(
    '/',
    rateLimit({
      windowMs: 60000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        code: 'RATE_LIMITED',
        message: 'Summary limit reached. Try again in a minute.',
      },
    }),
    controller.createSummary,
  );
  router.get('/', controller.getSummaries);
  router.get('/:id', controller.getSummary);
  router.delete('/:id', controller.deleteSummary);
  return router;
}
module.exports = { createSummaryRouter };
