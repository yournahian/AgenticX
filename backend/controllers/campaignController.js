/**
 * ATOMX ENGAGE — CAMPAIGNS & REPLY QUEUE CONTROLLER
 */
const db = require('../config/db');
const { extractTweetLinks, filterTweetLinks } = require('../services/tweetExtractorService');

exports.getCampaigns = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const campaigns = db.getCampaigns(userId);
  res.json({ campaigns });
};

exports.getQueue = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const queue = db.getQueue(userId);

  const stats = {
    total: queue.length,
    completed: queue.filter(q => q.status === 'COMPLETED').length,
    processing: queue.filter(q => q.status === 'PROCESSING').length,
    waiting: queue.filter(q => q.status === 'WAITING').length,
    failed: queue.filter(q => q.status === 'FAILED').length
  };

  res.json({ stats, queue });
};

exports.addToQueue = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const { campaignId = 1, author, handle, content } = req.body;

  if (!author || !content) {
    return res.status(400).json({ error: 'Author and tweet content are required' });
  }

  const result = db.addToQueue(userId, campaignId, author, handle || '@user', content);
  res.status(201).json({
    message: 'Added to reply queue',
    queueId: result.lastInsertRowid
  });
};

// Batch parse & filter links from raw text (Telegram, etc.)
exports.parseAndFilterTweets = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const { rawText, currentQueueIds = [] } = req.body;

  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'rawText string is required' });
  }

  // 1. Extract all valid links (ignoring Telegram text, timestamps, emojis, bot headers)
  const extracted = extractTweetLinks(rawText);

  // 2. Fetch already engaged tweet IDs from persistent database
  const dbEngagedIds = db.getEngagedTweetIds(userId);

  // 3. Filter duplicates, already engaged, and already in queue
  const summary = filterTweetLinks(extracted, {
    alreadyEngagedIds: dbEngagedIds,
    currentQueueIds
  });

  res.json(summary);
};

// Get list of engaged tweet IDs for the user
exports.getEngagedTweets = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const engagedIds = db.getEngagedTweetIds(userId);
  res.json({
    count: engagedIds.length,
    engagedIds
  });
};

// Mark tweets as engaged (called when an action or reply finishes)
exports.markTweetsEngaged = (req, res) => {
  const userId = Number(req.headers['x-user-id'] || 1);
  const { tweets } = req.body;

  if (!tweets) {
    return res.status(400).json({ error: 'tweets array or object required' });
  }

  db.markTweetsEngaged(tweets, userId);
  res.json({
    message: 'Marked as engaged',
    count: Array.isArray(tweets) ? tweets.length : 1
  });
};
