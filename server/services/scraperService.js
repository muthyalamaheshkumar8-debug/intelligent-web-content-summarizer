const axios = require('axios');
const { AppError } = require('../utils/errors');

function createScraperService(config, http = axios) {
  const headers = config.scraperToken
    ? { 'X-Scraper-Token': config.scraperToken }
    : {};
  return {
    async scrapeArticle(url) {
      try {
        const response = await http.post(
          `${config.scraperUrl}/scrape`,
          { url },
          {
            headers,
            timeout: 30000,
            maxContentLength: 250000,
            maxRedirects: 0,
          },
        );
        const value = response.data;
        if (
          typeof value?.content !== 'string' ||
          value.content.length < 200 ||
          value.content.length > 50000 ||
          typeof value.title !== 'string' ||
          !value.title.trim()
        )
          throw new AppError(
            422,
            'NO_CONTENT',
            'This page has too little readable article content. Try another public article.',
          );
        return { title: value.title.slice(0, 500), content: value.content };
      } catch (error) {
        if (error instanceof AppError) throw error;
        const status = error.response?.status;
        if ([400, 403].includes(status))
          throw new AppError(
            400,
            'BLOCKED_URL',
            'This URL cannot be fetched. Use a public HTTP or HTTPS article.',
          );
        if ([404, 415, 422].includes(status))
          throw new AppError(
            422,
            'NO_CONTENT',
            'Could not read this page. It may be unavailable, protected, or not an HTML article.',
          );
        if (error.code === 'ECONNABORTED' || status === 504)
          throw new AppError(
            504,
            'SCRAPER_TIMEOUT',
            'The webpage took too long to load. Try again or use another article.',
          );
        throw new AppError(
          503,
          'SCRAPER_UNAVAILABLE',
          'Article extraction is temporarily unavailable. Please try again.',
        );
      }
    },
    async healthy() {
      try {
        const response = await http.get(`${config.scraperUrl}/health`, {
          headers,
          timeout: 2000,
          maxRedirects: 0,
        });
        return response.data.status === 'ok';
      } catch {
        return false;
      }
    },
  };
}
module.exports = { createScraperService };
