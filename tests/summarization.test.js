const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSummarizationService, extractSummary } =
  require('../server/services/summarizationService');
const { fixture, article, generated, AppError } = require('./helpers/fixtures');

const content = [
  'The observatory began measuring atmospheric conditions in January.',
  'Researchers calibrated every sensor before publishing their measurements.',
  'Atmospheric measurements showed substantial variation across the sites.',
  'The scientists said that additional measurements were needed to confirm the pattern.',
  'The full dataset is available for independent analysis and replication.',
  'Funding for the observatory came from several public research institutions.',
].join(' ');

test('outages produce only current article excerpts, with no duplicate or fabricated points', async () => {
  for (const code of ['AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_MODEL_UNAVAILABLE']) {
    const summarize = createSummarizationService({}, async () => {
      throw new AppError(503, code, 'Unavailable');
    });
    const result = await summarize(content, 'Atmospheric measurements');
    assert.equal(result.method, 'extractive');
    assert.equal(result.keyPoints.length, 5);
    assert.equal(new Set(result.keyPoints).size, 5);
    let previous = -1;
    for (const point of result.keyPoints) {
      const index = content.indexOf(point);
      assert.ok(index > previous);
      previous = index;
    }
    assert.equal(result.summary, result.keyPoints.slice(0, 3).join(' '));
    assert.doesNotMatch(result.summary, /thoughtful software/);
  }
});

test('AI successes keep their content; credentials, unsafe and unknown errors remain failures', async () => {
  const success = createSummarizationService({}, async () => generated);
  assert.deepEqual(await success(content, 'Title'), { ...generated, method: 'ai' });
  for (const code of ['AI_KEY_REJECTED', 'AI_PERMISSION_DENIED',
    'AI_CONFIGURATION_ERROR', 'INVALID_AI_RESPONSE']) {
    const error = new AppError(503, code, 'Failed');
    const summarize = createSummarizationService({}, async () => { throw error; });
    await assert.rejects(summarize(content, 'Title'), (thrown) => thrown === error);
  }
  const unknown = createSummarizationService({}, async () => { throw new Error('Bug'); });
  await assert.rejects(unknown(content, 'Title'), /Bug/);
});

test('repeated, unpunctuated and multilingual sources remain bounded and source-faithful', () => {
  const repeated = extractSummary(article.content, article.title);
  assert.equal(repeated.keyPoints.length, 1);
  assert.equal(repeated.summary, article.content.trim().split('. ')[0] + '.');
  for (const source of [
    'This paragraph contains a detailed account of the research and its findings '.repeat(2000),
    '研究人员公布了关于大气变化的完整测量数据，并说明仍然需要进一步分析来验证初步结果。'.repeat(20),
  ]) {
    const result = extractSummary(source, 'Title'.repeat(100));
    assert.ok(result.summary.length <= 6000);
    assert.ok(result.topic.length <= 120);
    for (const point of result.keyPoints) {
      assert.ok(point.length <= 1000);
      assert.ok(source.includes(point));
    }
  }
  assert.throws(() => extractSummary('Tiny page.', 'Title'), { code: 'NO_CONTENT' });
});

test('an outage result is saved, returned and readable from private history', async () => {
  const f = fixture({
    scrapeArticle: async () => ({ title: 'Atmospheric measurements', content }),
    generateSummary: createSummarizationService({}, async () => {
      throw new AppError(503, 'AI_UNAVAILABLE', 'Unavailable');
    }),
  });
  try {
    const response = await f.post({ url: 'https://example.com/research' });
    assert.equal(response.status, 201);
    assert.equal(response.body.method, 'extractive');
    const history = await f.agent.get('/api/summaries');
    assert.equal(history.status, 200);
    assert.equal(history.body[0].method, 'extractive');
    assert.deepEqual(history.body[0].keyPoints, response.body.keyPoints);
  } finally {
    f.app.locals.events.close();
  }
});
