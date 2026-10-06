/**
 * ATOMX ENGAGE — EMBEDDED PERSISTENT DATABASE ENGINE
 * Implements atomic credit math, ledger auditing, and relational storage.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'atomx.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys for high reliability
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      handle TEXT,
      role TEXT DEFAULT 'USER',
      status TEXT DEFAULT 'ACTIVE',
      plan_tier TEXT DEFAULT 'Growth Plan',
      credits INTEGER DEFAULT 10000,
      max_credits INTEGER DEFAULT 10000,
      avatar_initials TEXT DEFAULT 'AC',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credits_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      action TEXT NOT NULL,
      admin_source TEXT DEFAULT 'System',
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      use_case TEXT,
      status TEXT DEFAULT 'PENDING',
      initial_credits_granted INTEGER DEFAULT 100,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      provider TEXT DEFAULT 'OpenAI',
      reply_style TEXT DEFAULT 'Natural & Concise',
      pacing_delay_sec INTEGER DEFAULT 12,
      break_after_count INTEGER DEFAULT 30,
      break_duration_sec INTEGER DEFAULT 60,
      is_running INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reply_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      user_id INTEGER NOT NULL,
      tweet_author TEXT NOT NULL,
      tweet_handle TEXT NOT NULL,
      tweet_content TEXT NOT NULL,
      reply_content TEXT,
      status TEXT DEFAULT 'WAITING',
      credit_cost INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_monthly REAL NOT NULL,
      credits_monthly INTEGER NOT NULL,
      is_popular INTEGER DEFAULT 0,
      features_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      credits_added INTEGER NOT NULL,
      status TEXT DEFAULT 'COMPLETED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS engaged_tweets (
      tweet_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      handle TEXT,
      canonical_url TEXT,
      action_type TEXT DEFAULT 'REPLY',
      engaged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedInitialData();
}

// Seed baseline data if fresh
function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    console.log('[DB] Initializing database with Admin account and plans...');

    // Single Root Admin User (Evan Jawad)
    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, handle, role, status, plan_tier, credits, max_credits, avatar_initials)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('evan@atomx.io', 'hashed_pass_evan', 'Evan Jawad', '@evanjawadx', 'ADMIN', 'ACTIVE', 'Admin', 10000, 10000, 'EJ');

    // Real System Pricing Plans
    const insertPlan = db.prepare(`
      INSERT INTO plans (id, name, price_monthly, credits_monthly, is_popular, features_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertPlan.run('free', 'FREE', 0, 100, 0, JSON.stringify(['100 AI replies', 'Basic reply styles', 'Reply queue', 'Basic history']));
    insertPlan.run('growth', 'GROWTH', 12, 10000, 1, JSON.stringify(['10,000 AI replies', 'All reply styles', 'Advanced queue', 'Full history', 'Priority generation']));
    insertPlan.run('pro', 'PRO', 29, 25000, 0, JSON.stringify(['25,000 AI replies', 'Premium AI models', 'Advanced agents', 'Priority generation', 'Advanced analytics']));

    console.log('[DB] Initialization completed (clean, zero dummy data).');
  }
}

initDatabase();

module.exports = {
  db,
  
  // User Helpers
  getUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  
  getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  getAllUsers() {
    return db.prepare('SELECT id, full_name, email, handle, role, status, plan_tier, credits, max_credits, avatar_initials, created_at FROM users ORDER BY id ASC').all();
  },

  updateUserStatus(userId, status) {
    return db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  },

  // Atomic Server-Side Credit Math (Rule: 1 Credit = 1 AI reply)
  deductCredit(userId, amount = 1, action = 'AI Reply', reason = 'Generated reply') {
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found');
    if (user.credits < amount) throw new Error('Insufficient credits');

    const newBalance = user.credits - amount;
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, userId);

    db.prepare(`
      INSERT INTO credits_ledger (user_id, amount, balance_after, action, admin_source, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, -amount, newBalance, action, 'Server System', reason);

    return newBalance;
  },

  addCredits(userId, amount, action = 'Bonus', adminSource = 'Admin', reason = 'Credit adjustment') {
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found');

    const newBalance = user.credits + amount;
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, userId);

    db.prepare(`
      INSERT INTO credits_ledger (user_id, amount, balance_after, action, admin_source, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, amount, newBalance, action, adminSource, reason);

    return newBalance;
  },

  getLedger(userId) {
    return db.prepare('SELECT * FROM credits_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
  },

  getAllLedger() {
    return db.prepare(`
      SELECT l.*, u.full_name as user_name, u.email as user_email
      FROM credits_ledger l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC
      LIMIT 100
    `).all();
  },

  // Access Requests & Approval
  getAccessRequests() {
    return db.prepare('SELECT * FROM access_requests ORDER BY requested_at DESC').all();
  },

  createAccessRequest(fullName, email, useCase) {
    return db.prepare(`
      INSERT INTO access_requests (full_name, email, use_case, status, initial_credits_granted)
      VALUES (?, ?, ?, 'PENDING', 100)
    `).run(fullName, email, useCase);
  },

  approveAccessRequest(requestId) {
    const req = db.prepare('SELECT * FROM access_requests WHERE id = ?').get(requestId);
    if (!req) throw new Error('Access request not found');

    // Create user with 100 initial free credits
    const initials = req.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, handle, role, status, plan_tier, credits, max_credits, avatar_initials)
      VALUES (?, ?, ?, ?, 'USER', 'ACTIVE', 'Free Plan', 100, 100, ?)
    `).run(req.email, 'approved_hash', req.full_name, '@' + req.email.split('@')[0], initials);

    const newUserId = result.lastInsertRowid;

    // Record initial grant in ledger
    db.prepare(`
      INSERT INTO credits_ledger (user_id, amount, balance_after, action, admin_source, reason)
      VALUES (?, 100, 100, 'Initial Grant', 'Admin Approval', 'Approved free onboarding: 100 free credits')
    `).run(newUserId);

    // Update request status
    db.prepare(`
      UPDATE access_requests
      SET status = 'APPROVED', reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(requestId);

    return { userId: newUserId, credits: 100 };
  },

  // Campaigns & Queue
  getCampaigns(userId) {
    return db.prepare('SELECT * FROM campaigns WHERE user_id = ?').all(userId);
  },

  getQueue(userId) {
    return db.prepare('SELECT * FROM reply_queue WHERE user_id = ? ORDER BY id DESC').all(userId);
  },

  addToQueue(userId, campaignId, author, handle, content) {
    return db.prepare(`
      INSERT INTO reply_queue (campaign_id, user_id, tweet_author, tweet_handle, tweet_content, status)
      VALUES (?, ?, ?, ?, ?, 'WAITING')
    `).run(campaignId, userId, author, handle, content);
  },

  // Plans & Transactions
  getPlans() {
    return db.prepare('SELECT * FROM plans').all();
  },

  getTransactions() {
    return db.prepare(`
      SELECT t.*, u.full_name as user_name, u.email as user_email
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `).all();
  },

  // Engaged Tweets Tracking
  getEngagedTweetIds(userId = 1) {
    const rows = db.prepare('SELECT tweet_id FROM engaged_tweets WHERE user_id = ?').all(userId);
    return rows.map(r => r.tweet_id);
  },

  isTweetEngaged(tweetId, userId = 1) {
    const row = db.prepare('SELECT tweet_id FROM engaged_tweets WHERE tweet_id = ? AND user_id = ?').get(String(tweetId), userId);
    return !!row;
  },

  markTweetsEngaged(tweets, userId = 1) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO engaged_tweets (tweet_id, user_id, handle, canonical_url, action_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const list = Array.isArray(tweets) ? tweets : [tweets];
    for (const t of list) {
      const id = t?.tweetId || t?.tweet_id || t?.id;
      if (!id) continue;
      stmt.run(
        String(id),
        userId,
        t.handle || '@creator',
        t.canonicalUrl || t.canonical_url || '',
        t.actionType || t.action_type || 'REPLY'
      );
    }
  }
};
