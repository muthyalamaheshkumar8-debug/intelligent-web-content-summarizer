const Summary = require('../models/Summary');
const { scrapeArticle } = require('../services/scraperService');
const { generateSummary } = require('../services/geminiService');

exports.createSummary = async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ message: 'Please enter a valid URL' });
    }

    const scraped = await scrapeArticle(url);

    const summaryData = await generateSummary(scraped.content, scraped.title);

    const summary = await Summary.create({
      url,
      title: scraped.title,
      content: scraped.content,
      summary: summaryData.summary,
      keyPoints: summaryData.keyPoints,
      topic: summaryData.topic
    });

    res.status(201).json(summary);
  } catch (error) {
    next(error);
  }
};

exports.getSummaries = async (req, res, next) => {
  try {
    const summaries = await Summary.find().sort({ createdAt: -1 }).limit(20);
    res.json(summaries);
  } catch (error) {
    next(error);
  }
};

exports.getSummary = async (req, res, next) => {
  try {
    const summary = await Summary.findById(req.params.id);
    if (!summary) {
      return res.status(404).json({ message: 'Summary not found' });
    }
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

exports.deleteSummary = async (req, res, next) => {
  try {
    const summary = await Summary.findByIdAndDelete(req.params.id);
    if (!summary) {
      return res.status(404).json({ message: 'Summary not found' });
    }
    res.json({ message: 'Summary deleted' });
  } catch (error) {
    next(error);
  }
};
