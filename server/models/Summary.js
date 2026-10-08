const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema(
  {
    ownerId: { type: String, select: false },
    url: { type: String, required: true, maxlength: 2048, index: true },
    title: { type: String, required: true, maxlength: 500 },
    content: { type: String, required: true, maxlength: 50000, select: false },
    summary: { type: String, required: true, maxlength: 6000 },
    keyPoints: [{ type: String, maxlength: 1000 }],
    topic: { type: String, maxlength: 120 },
    method: { type: String, enum: ['ai', 'extractive'], default: 'ai' },
    wordCount: { type: Number, min: 0 },
    readingMinutes: { type: Number, min: 1 },
  },
  { timestamps: true },
);
summarySchema.index({ ownerId: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('Summary', summarySchema);
