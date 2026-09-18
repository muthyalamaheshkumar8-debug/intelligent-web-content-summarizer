const axios = require('axios');

const scrapeArticle = async (url) => {
  try {
    // Call Python scraper service
    const response = await axios.post('http://localhost:5001/scrape', { url });
    return response.data;
  } catch (error) {
    throw new Error('Failed to scrape article content');
  }
};

module.exports = { scrapeArticle };
