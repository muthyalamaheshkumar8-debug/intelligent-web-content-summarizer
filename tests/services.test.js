const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGeminiService,
  parseSummary,
} = require('../server/services/geminiService');
const { createScraperService } = require('../server/services/scraperService');
const { loadConfig } = require('../server/config');
const { article, generated } = require('./helpers/fixtures');

test('Gemini uses API-key authentication, schema JSON and separates source from instructions', async () => {
  let call;
  const generate = createGeminiService(
    { model: 'gemini-3.8-flash', geminiKey: 'test-key' },
    {
      async post(...args) {
        call = args;
        return {
          data: {
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: JSON.stringify(generated) }] },
              },
            ],
          },
        };
      },
    },
  );
  assert.deepEqual(await generate(article.content, article.title), generated);
  assert.equal(call[2].headers['x-goog-api-key'], 'test-key');
  assert.equal(call[2].headers.Authorization, undefined);
  assert.equal(
    call[1].generationConfig.responseFormat.text.mimeType,
    'application/json',
  );
  assert.equal(
    JSON.parse(call[1].contents[0].parts[0].text).article,
    article.content,
  );
  assert.equal(call[2].timeout, 60000);
});

test('invalid, missing and truncated model output is rejected', async () => {
  for (const text of [
    'not json',
    '{}',
    JSON.stringify({ ...generated, keyPoints: ['One'] }),
    JSON.stringify({ ...generated, topic: '' }),
  ])
    assert.throws(() => parseSummary(text), { code: 'INVALID_AI_RESPONSE' });
  const generate = createGeminiService(
    { model: 'test', geminiKey: 'test' },
    {
      async post() {
        return { data: { candidates: [{ finishReason: 'MAX_TOKENS' }] } };
      },
    },
  );
  await assert.rejects(generate('text', 'title'), {
    code: 'INVALID_AI_RESPONSE',
  });
});

test('upstream AI errors and timeouts do not leak provider messages', async () => {
  for (const [error, code] of [
    [{ response: { status: 429 } }, 'AI_RATE_LIMITED'],
    [{ code: 'ECONNABORTED' }, 'AI_TIMEOUT'],
    [{ response: { status: 401 }, message: 'secret' }, 'AI_UNAVAILABLE'],
  ]) {
    const generate = createGeminiService(
      { model: 'test', geminiKey: 'test' },
      {
        async post() {
          throw error;
        },
      },
    );
    await assert.rejects(generate('text', 'title'), { code });
  }
});

test('scraper integration validates payloads, passes token and maps failures', async () => {
  const config = {
    scraperUrl: 'http://127.0.0.1:5001',
    scraperToken: 'test-token',
  };
  const service = createScraperService(config, {
    async post(_url, _body, options) {
      assert.equal(options.headers['X-Scraper-Token'], 'test-token');
      return { data: article };
    },
  });
  assert.deepEqual(await service.scrapeArticle('https://example.com'), article);
  const invalid = createScraperService(config, {
    async post() {
      return { data: { content: '', title: '' } };
    },
  });
  await assert.rejects(invalid.scrapeArticle('https://example.com'), {
    code: 'NO_CONTENT',
  });
  for (const [status, code] of [
    [403, 'BLOCKED_URL'],
    [415, 'NO_CONTENT'],
    [504, 'SCRAPER_TIMEOUT'],
    [500, 'SCRAPER_UNAVAILABLE'],
  ]) {
    const failed = createScraperService(config, {
      async post() {
        throw { response: { status } };
      },
    });
    await assert.rejects(failed.scrapeArticle('https://example.com'), { code });
  }
});

test('production refuses missing configuration, insecure origins and weak secrets', () => {
  assert.throws(() => loadConfig({}), /MONGODB_URI/);
  const valid = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://localhost/test',
    GEMINI_API_KEY: 'test',
    SESSION_SECRET: 'a'.repeat(64),
    SCRAPER_TOKEN: 'b'.repeat(64),
    CLIENT_ORIGIN: 'https://example.com',
  };
  assert.equal(loadConfig(valid).production, true);
  const render = {
    ...valid,
    CLIENT_ORIGIN: undefined,
    RENDER_EXTERNAL_URL: 'https://summarizer.onrender.com',
  };
  assert.deepEqual(loadConfig(render).origins, [
    'https://summarizer.onrender.com',
  ]);
  assert.deepEqual(
    loadConfig({ ...render, CLIENT_ORIGIN: 'https://custom.example' }).origins,
    ['https://custom.example'],
  );
  assert.throws(
    () => loadConfig({ ...render, RENDER_EXTERNAL_URL: undefined }),
    /CLIENT_ORIGIN/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...render,
        RENDER_EXTERNAL_URL: 'http://summarizer.onrender.com',
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...render,
        RENDER_EXTERNAL_URL: 'https://summarizer.onrender.com/path',
      }),
    /exact origins/,
  );
  assert.throws(
    () => loadConfig({ ...valid, SESSION_SECRET: 'short' }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () => loadConfig({ ...valid, CLIENT_ORIGIN: 'http://example.com' }),
    /HTTPS/,
  );
  assert.throws(
    () => loadConfig({ ...valid, GEMINI_MODEL: '../../evil' }),
    /GEMINI_MODEL/,
  );
});
