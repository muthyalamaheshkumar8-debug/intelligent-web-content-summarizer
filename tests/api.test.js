const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, request, AppError } = require('./helpers/fixtures');

test('health reports readiness and unavailable dependencies', async () => {
  const { app } = fixture();
  assert.equal((await request(app).get('/api/health')).body.status, 'ok');
  const offline = fixture({ readiness: async () => false });
  assert.equal((await request(offline.app).get('/api/health')).status, 503);
});

test('create → list → detail → delete, excluding private fields', async () => {
  const { post, agent, model } = fixture();
  await agent.get('/api/session');
  const response = await post({ url: 'https://example.com/article#section' });
  assert.equal(response.status, 201);
  assert.equal(response.body.url, 'https://example.com/article');
  assert.equal(response.body.content, undefined);
  assert.equal(response.body.ownerId, undefined);
  assert.ok(model.records[0].content);
  assert.ok(model.records[0].ownerId);
  const list = await agent.get('/api/summaries');
  assert.equal(list.body.length, 1);
  assert.equal(list.headers['cache-control'], 'no-store');
  assert.equal(
    (await agent.get(`/api/summaries/${response.body._id}`)).status,
    200,
  );
  assert.equal(
    (
      await agent
        .delete(`/api/summaries/${response.body._id}`)
        .set('X-Requested-With', 'WebContentSummarizer')
    ).status,
    200,
  );
  assert.equal((await agent.get('/api/summaries')).body.length, 0);
});

test('other sessions cannot list, read or delete another visitor’s summary', async () => {
  const { post, app, agent } = fixture();
  await agent.get('/api/session');
  const created = await post({ url: 'https://example.com/article' });
  const stranger = request.agent(app);
  await stranger.get('/api/session');
  assert.deepEqual((await stranger.get('/api/summaries')).body, []);
  assert.equal(
    (await stranger.get(`/api/summaries/${created.body._id}`)).status,
    404,
  );
  assert.equal(
    (
      await stranger
        .delete(`/api/summaries/${created.body._id}`)
        .set('X-Requested-With', 'WebContentSummarizer')
    ).status,
    404,
  );
});

test('unsigned legacy records are preserved but not publicly listed', async () => {
  const { model, agent } = fixture();
  await model.create({
    url: 'https://example.com/old',
    summary: 'Legacy summary',
  });
  await agent.get('/api/session');
  assert.deepEqual((await agent.get('/api/summaries')).body, []);
  assert.equal(model.records.length, 1);
});

test('URL, request ID, pagination and identifier validation', async () => {
  const { post, agent } = fixture();
  for (const url of [
    '',
    'invalid',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'https://example.com:3000',
    'x'.repeat(2049),
    { $ne: '' },
  ]) {
    assert.equal((await fixture().post({ url })).status, 400);
  }
  assert.equal(
    (await post({ url: 'https://example.com', requestId: {} })).status,
    400,
  );
  assert.equal((await agent.get('/api/summaries/not-an-id')).status, 400);
  assert.equal((await agent.get('/api/summaries?limit=100')).status, 400);
  assert.equal((await agent.get('/api/summaries?cursor=invalid')).status, 400);
});

test('mutations require the custom header and an allowed origin', async () => {
  const { app, post, agent } = fixture();
  assert.equal(
    (
      await request(app)
        .post('/api/summaries')
        .send({ url: 'https://example.com' })
    ).status,
    403,
  );
  assert.equal(
    (
      await post({ url: 'https://example.com' }).set(
        'Origin',
        'https://evil.example',
      )
    ).status,
    403,
  );
  assert.equal(
    (await agent.get('/api/summaries').set('Origin', 'https://evil.example'))
      .status,
    403,
  );
  const allowed = await agent
    .get('/api/session')
    .set('Origin', 'http://localhost:5173');
  assert.equal(
    allowed.headers['access-control-allow-origin'],
    'http://localhost:5173',
  );
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');
});

test('malformed JSON, oversized bodies and missing routes have safe JSON errors', async () => {
  const { app, post } = fixture();
  assert.equal(
    (
      await request(app)
        .post('/api/summaries')
        .set('Content-Type', 'application/json')
        .send('{')
    ).status,
    400,
  );
  assert.equal((await post({ url: 'x'.repeat(10000) })).status, 413);
  assert.equal((await request(app).get('/api/missing')).body.code, 'NOT_FOUND');
  const broken = fixture({
    scrapeArticle: async () => {
      throw new Error('secret-key-and-private-url');
    },
  });
  const response = await broken.post({ url: 'https://example.com/article' });
  assert.equal(response.status, 500);
  assert.ok(!JSON.stringify(response.body).includes('secret'));
  assert.ok(response.body.requestId);
});

test('session cookie is HttpOnly, SameSite and signed; tampering creates no access', async () => {
  const { agent, post, app } = fixture();
  const bootstrap = await agent.get('/api/session');
  const cookie = bootstrap.headers['set-cookie'][0];
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Path=/api'));
  await post({ url: 'https://example.com/article' });
  const tampered = cookie.split(';')[0].slice(0, -1) + 'x';
  assert.deepEqual(
    (await request(app).get('/api/summaries').set('Cookie', tampered)).body,
    [],
  );
  const invalidUnicode = cookie
    .split(';')[0]
    .replace(/\.[^.]+$/, '.' + 'é'.repeat(43));
  assert.equal(
    (await request(app).get('/api/session').set('Cookie', invalidUnicode))
      .status,
    200,
  );
});

test('concurrent generation is limited and capacity is released after failure', async () => {
  let release;
  let started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const { agent, post } = fixture({
    scrapeArticle: async () => {
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
      throw new AppError(503, 'SCRAPER_UNAVAILABLE', 'Try again.');
    },
  });
  await agent.get('/api/session');
  const first = post({ url: 'https://example.com/article' }).then(
    (value) => value,
  );
  await began;
  assert.equal(
    (await post({ url: 'https://example.com/another' })).status,
    429,
  );
  release();
  assert.equal((await first).status, 503);
});

test('generation emits actual stages, completion, deletion and failure', async () => {
  const published = [];
  const events = {
    publish(owner, value) {
      published.push({ owner, ...value });
    },
    subscribe() {},
  };
  const { agent, post } = fixture({ events });
  await agent.get('/api/session');
  const response = await post({ url: 'https://example.com/article' });
  assert.deepEqual(
    published.map((value) => value.stage),
    ['extracting', 'summarizing', 'saving', 'complete'],
  );
  assert.ok(published.every((value) => value.owner === published[0].owner));
  await agent
    .delete(`/api/summaries/${response.body._id}`)
    .set('X-Requested-With', 'WebContentSummarizer');
  assert.equal(published.at(-1).stage, 'deleted');
  const broken = fixture({
    events,
    generateSummary: async () => {
      throw new AppError(503, 'AI_UNAVAILABLE', 'Try again.');
    },
  });
  await broken.post({ url: 'https://example.com' });
  assert.equal(published.at(-1).stage, 'failed');
});

test('summary rate limit is enforced', async () => {
  const { post } = fixture();
  for (let index = 0; index < 5; index++) await post({ url: 'invalid' });
  assert.equal((await post({ url: 'invalid' })).status, 429);
});
