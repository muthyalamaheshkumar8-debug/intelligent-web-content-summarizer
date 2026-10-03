const { createRequire } = require('node:module');
const requireServer = createRequire(
  require('node:path').resolve(__dirname, '../../server/package.json'),
);
const request = requireServer('supertest');
const { createApp } = require('../../server/app');
const { AppError } = require('../../server/utils/errors');

const article = {
  title: 'Building thoughtful software',
  content:
    'Thoughtful software balances useful features with reliable systems. '.repeat(
      12,
    ),
};
const generated = {
  summary:
    'Thoughtful software combines clear interfaces with dependable systems.',
  keyPoints: [
    'Design clear interfaces.',
    'Keep systems reliable.',
    'Verify important workflows.',
  ],
  topic: 'Engineering',
};
const config = {
  origins: ['http://localhost:5173'],
  production: false,
  trustProxy: 0,
  sessionSecret: 'test-session-secret-that-is-over-thirty-two-characters',
};

function fakeModel() {
  const records = [];
  let count = 1;
  const matches = (value, filter) =>
    (!filter.ownerId || value.ownerId === filter.ownerId) &&
    (!filter._id || value._id === filter._id);
  return {
    records,
    async create(data) {
      const value = {
        ...data,
        _id: String(count++).padStart(24, '0'),
        createdAt: new Date().toISOString(),
      };
      records.push(value);
      return value;
    },
    find(filter) {
      let limit = 20;
      return {
        sort() {
          return this;
        },
        limit(value) {
          limit = value;
          return this;
        },
        async lean() {
          return records
            .filter((value) => matches(value, filter))
            .reverse()
            .slice(0, limit);
        },
      };
    },
    findOne(filter) {
      return {
        async lean() {
          return records.find((value) => matches(value, filter)) || null;
        },
      };
    },
    async findOneAndDelete(filter) {
      const index = records.findIndex((value) => matches(value, filter));
      return index >= 0 ? records.splice(index, 1)[0] : null;
    },
  };
}
function fixture(overrides = {}) {
  const model = overrides.model || fakeModel();
  const app = createApp({
    config,
    model,
    scrapeArticle: async () => article,
    generateSummary: async () => generated,
    ...overrides,
  });
  const agent = request.agent(app);
  const post = (body, client = agent) =>
    client
      .post('/api/summaries')
      .set('X-Requested-With', 'WebContentSummarizer')
      .send(body);
  return { app, model, agent, post };
}
module.exports = {
  requireServer,
  request,
  fixture,
  article,
  generated,
  config,
  AppError,
};
