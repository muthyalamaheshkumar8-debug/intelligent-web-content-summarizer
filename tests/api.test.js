const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

describe('API Tests', () => {
  test('GET /api/health', async () => {
    const response = await axios.get(`${BASE_URL}/health`);
    expect(response.data.status).toBe('ok');
  });

  test('POST /api/summaries with valid URL', async () => {
    const response = await axios.post(`${BASE_URL}/summaries`, {
      url: 'https://example.com/article'
    });
    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('url');
    expect(response.data).toHaveProperty('title');
    expect(response.data).toHaveProperty('summary');
  });

  test('POST /api/summaries with invalid URL', async () => {
    try {
      await axios.post(`${BASE_URL}/summaries`, { url: 'invalid' });
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.message).toBeDefined();
    }
  });

  test('GET /api/summaries', async () => {
    const response = await axios.get(`${BASE_URL}/summaries`);
    expect(Array.isArray(response.data)).toBe(true);
  });
});
