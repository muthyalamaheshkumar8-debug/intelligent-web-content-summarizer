const crypto = require('node:crypto');
const { AppError } = require('../utils/errors');
const {
  validateUrl,
  validateId,
  readPagination,
} = require('../utils/validation');

const publicSummary = (document) => {
  const value = document.toObject ? document.toObject() : { ...document };
  delete value.content;
  delete value.ownerId;
  delete value.__v;
  return value;
};

function createSummaryController({
  model,
  scrapeArticle,
  generateSummary,
  events,
}) {
  const activeOwners = new Set();
  return {
    async createSummary(req, res, next) {
      let acquired = false;
      let requestId;
      const publish = (stage) =>
        events.publish(req.ownerId, { requestId, stage });
      try {
        const url = validateUrl(req.body?.url);
        requestId = req.body.requestId || crypto.randomUUID();
        if (
          typeof requestId !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(requestId)
        )
          throw new AppError(
            400,
            'INVALID_REQUEST',
            'Invalid request identifier.',
          );
        if (activeOwners.has(req.ownerId) || activeOwners.size >= 10)
          throw new AppError(
            429,
            'BUSY',
            'A summary is already running, or the service is busy. Try again shortly.',
          );
        activeOwners.add(req.ownerId);
        acquired = true;
        publish('extracting');
        const scraped = await scrapeArticle(url);
        publish('summarizing');
        const generated = await generateSummary(scraped.content, scraped.title);
        publish('saving');
        const wordCount = scraped.content.trim().split(/\s+/).length;
        const document = await model.create({
          ownerId: req.ownerId,
          url,
          title: scraped.title,
          content: scraped.content,
          ...generated,
          wordCount,
          readingMinutes: Math.max(1, Math.ceil(wordCount / 200)),
        });
        const result = publicSummary(document);
        events.publish(req.ownerId, {
          requestId,
          stage: 'complete',
          summaryId: String(result._id),
        });
        res.status(201).json(result);
      } catch (error) {
        if (acquired) publish('failed');
        next(error);
      } finally {
        if (acquired) activeOwners.delete(req.ownerId);
      }
    },
    async getSummaries(req, res, next) {
      try {
        const { limit, cursor } = readPagination(req.query);
        const filter = { ownerId: req.ownerId };
        if (cursor)
          filter.$or = [
            { createdAt: { $lt: new Date(cursor.date) } },
            { createdAt: new Date(cursor.date), _id: { $lt: cursor.id } },
          ];
        const documents = await model
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit + 1)
          .lean();
        const page = documents.slice(0, limit);
        if (documents.length > limit) {
          const last = page.at(-1);
          res.set(
            'X-Next-Cursor',
            Buffer.from(
              JSON.stringify({
                id: String(last._id),
                date: new Date(last.createdAt).toISOString(),
              }),
            ).toString('base64url'),
          );
        }
        res.set('Cache-Control', 'no-store');
        res.json(page.map(publicSummary));
      } catch (error) {
        next(error);
      }
    },
    async getSummary(req, res, next) {
      try {
        validateId(req.params.id);
        const summary = await model
          .findOne({ _id: req.params.id, ownerId: req.ownerId })
          .lean();
        if (!summary)
          throw new AppError(404, 'NOT_FOUND', 'Summary not found.');
        res.set('Cache-Control', 'no-store');
        res.json(publicSummary(summary));
      } catch (error) {
        next(error);
      }
    },
    async deleteSummary(req, res, next) {
      try {
        validateId(req.params.id);
        const summary = await model.findOneAndDelete({
          _id: req.params.id,
          ownerId: req.ownerId,
        });
        if (!summary)
          throw new AppError(404, 'NOT_FOUND', 'Summary not found.');
        events.publish(req.ownerId, {
          stage: 'deleted',
          summaryId: req.params.id,
        });
        res.json({ message: 'Summary deleted' });
      } catch (error) {
        next(error);
      }
    },
  };
}
module.exports = { createSummaryController, publicSummary };
