const { createGeminiService } = require('./geminiService');
const { AppError } = require('../utils/errors');
const { log } = require('../utils/logger');

const recoverable = new Set([
  'AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_MODEL_UNAVAILABLE',
]);
const stopWords = new Set(('the and for that this with from have has are was were ' +
  'will can not but you your they their into more about also been').split(' '));
const words = (text) => (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
  .filter((word) => !stopWords.has(word));

// Select actual source sentences; never substitute example or invented claims.
function extractSummary(articleText, title) {
  const source = articleText.slice(0, 50000).replace(/\s+/gu, ' ').trim();
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'sentence' })
    .segment(source)].map((part) => part.segment.trim());
  const seen = new Set();
  const sentences = segments.filter((sentence) => {
    if (sentence.length < 40 || sentence.length > 1000 || seen.has(sentence))
      return false;
    seen.add(sentence);
    return true;
  });
  if (!sentences.length) {
    // A long unpunctuated paragraph still provides a verbatim source excerpt.
    let excerpt = source.slice(0, 900);
    const boundary = excerpt.lastIndexOf(' ');
    if (source.length > 900 && boundary > 600) excerpt = excerpt.slice(0, boundary);
    if (excerpt.length < 40)
      throw new AppError(422, 'NO_CONTENT', 'This page has too little article text to summarize.');
    sentences.push(excerpt);
  }
  const frequency = new Map();
  for (const sentence of sentences)
    for (const word of new Set(words(sentence)))
      frequency.set(word, (frequency.get(word) || 0) + 1);
  const titleWords = new Set(words(title));
  const selected = sentences.map((sentence, index) => {
    const tokens = [...new Set(words(sentence))];
    const score = tokens.reduce((total, word) => total +
      (frequency.get(word) || 0) + (titleWords.has(word) ? 3 : 0), 0) /
      Math.sqrt(Math.max(tokens.length, 1)) + 2 / (index + 1);
    return { sentence, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5).sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);
  return {
    summary: selected.slice(0, 3).join(' '),
    keyPoints: selected,
    topic: title.slice(0, 120),
    method: 'extractive',
  };
}

function createSummarizationService(config, generate = createGeminiService(config)) {
  return async (articleText, title) => {
    try {
      return { ...await generate(articleText, title), method: 'ai' };
    } catch (error) {
      // Keep credential/configuration and content-blocking errors actionable.
      if (!(error instanceof AppError) || !recoverable.has(error.code)) throw error;
      const result = extractSummary(articleText, title);
      log('warn', 'source_summary_used', { reason: error.code });
      return result;
    }
  };
}

module.exports = { createSummarizationService, extractSummary };
