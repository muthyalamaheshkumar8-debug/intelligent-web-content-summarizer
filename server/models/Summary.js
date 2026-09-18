const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    required: true
  },
  keyPoints: [{
    type: String
  }],
  topic: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Summary', summarySchema);
