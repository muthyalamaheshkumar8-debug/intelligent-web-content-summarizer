const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  requireServer,
  fixture,
  request,
  generated,
  article,
} = require('./helpers/fixtures');

// Opt-in because this starts a real mongod binary; no application database is used.
test(
  'real MongoDB: owner isolation, stable cursor pagination, persistence and deletion',
  { skip: process.env.RUN_DB_TESTS !== '1' },
  async () => {
    const { MongoMemoryServer } = requireServer('mongodb-memory-server');
    const mongoose = requireServer('mongoose');
    const Summary = require('../server/models/Summary');
    const mongo = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION || '8.0.17' },
      instance: { args: ['--nounixsocket'] },
    });
    try {
      await mongoose.connect(mongo.getUri());
      await Summary.syncIndexes();
      const { app, agent, post } = fixture({ model: Summary });
      await agent.get('/api/session');
      const created = await post({ url: 'https://example.com/article' });
      assert.equal(created.status, 201);
      const stored = await Summary.findById(created.body._id)
        .select('+ownerId +content')
        .lean();
      assert.ok(stored.content);
      const date = new Date();
      await Summary.insertMany(
        Array.from({ length: 24 }, (_, i) => ({
          ownerId: stored.ownerId,
          url: `https://example.com/${i}`,
          title: article.title,
          content: article.content,
          ...generated,
          createdAt: date,
        })),
      );
      const first = await agent.get('/api/summaries?limit=10');
      assert.equal(first.body.length, 10);
      const cursor = first.headers['x-next-cursor'];
      assert.ok(cursor);
      const second = await agent
        .get('/api/summaries')
        .query({ limit: 10, cursor });
      assert.equal(second.body.length, 10);
      assert.ok(
        second.body.every(
          (item) => !first.body.some((previous) => item._id === previous._id),
        ),
      );
      const third = await agent
        .get('/api/summaries')
        .query({ limit: 10, cursor: second.headers['x-next-cursor'] });
      assert.equal(third.body.length, 5);
      assert.equal(third.headers['x-next-cursor'], undefined);
      const stranger = request.agent(app);
      await stranger.get('/api/session');
      assert.deepEqual((await stranger.get('/api/summaries')).body, []);
      assert.equal(
        (await stranger.get(`/api/summaries/${created.body._id}`)).status,
        404,
      );
      assert.equal(
        (
          await agent
            .delete(`/api/summaries/${created.body._id}`)
            .set('X-Requested-With', 'WebContentSummarizer')
        ).status,
        200,
      );
      assert.equal(await Summary.countDocuments(), 24);
      await mongoose.disconnect();
      await mongoose.connect(mongo.getUri());
      assert.equal(await Summary.countDocuments(), 24);
    } finally {
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
