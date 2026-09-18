const axios = require('axios');

const generateSummary = async (articleText, title) => {
  try {
    const prompt = `You are a professional article summarization assistant.

Summarize the following article.

Return:
1. A concise summary (2-3 sentences)
2. 3-5 key points
3. The main topic

Keep the summary factual and do not introduce information that is not present in the article.

Title: ${title}

Article:
${articleText}`;

    // Replace with actual Gemini API call
    const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      contents: [{
        parts: [{ text: prompt }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`
      }
    });

    // Parse Gemini response to extract summary, keyPoints, and topic
    const result = response.data.candidates[0].content.parts[0].text;
    
    return {
      summary: extractSection(result, 'Summary'),
      keyPoints: extractKeyPoints(result),
      topic: extractSection(result, 'Topic')
    };
  } catch (error) {
    console.error('Gemini API error:', error.message);
    throw new Error('Unable to generate summary. Please try again.');
  }
};

const extractSection = (text, sectionName) => {
  const regex = new RegExp(`${sectionName}[:\\s]+([\\s\\S]*?)(?:\\n\\n|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
};

const extractKeyPoints = (text) => {
  const points = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.match(/^\d+\.\s|^•\s|^\-\s/) && line.length > 5) {
      points.push(line.replace(/^\d+\.\s|^•\s|^\-\s/, '').trim());
    }
    if (points.length >= 5) break;
  }
  return points;
};

module.exports = { generateSummary };
