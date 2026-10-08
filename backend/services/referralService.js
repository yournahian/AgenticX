/**
 * ATOMX ENGAGE — REFERRAL & REWARD SERVICE (LEVEL 1 DIRECT ONLY)
 * Rules:
 * 1. Direct Level-1 referrals only. No MLM / multi-tier.
 * 2. Referrals are rewarded ONLY upon Admin Account Approval:
 *    - Referrer: +150 Credits
 *    - Referred New User: +150 Credits
 * 3. First paid plan purchase reward: Referrer earns 10% equivalent credits on the initial purchase.
 * 4. All rewards are in Credits, never cash.
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const REFERRALS_FILE = path.join(__dirname, '../data/referrals.json');

function ensureDataDir() {
  const dir = path.dirname(REFERRALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(REFERRALS_FILE)) {
    fs.writeFileSync(REFERRALS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function loadReferrals() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(REFERRALS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveReferrals(records) {
  ensureDataDir();
  fs.writeFileSync(REFERRALS_FILE, JSON.stringify(records, null, 2), 'utf8');
}

module.exports = {
  /**
   * Register a new pending referral upon access request
   */
  recordPendingReferral({ referrerHandle, refereeHandle, refereeEmail, refereeName }) {
    if (!referrerHandle || !refereeHandle) return null;
    const cleanReferrer = '@' + referrerHandle.replace(/^@/, '').toLowerCase().trim();
    const cleanReferee = '@' + refereeHandle.replace(/^@/, '').toLowerCase().trim();

    if (cleanReferrer === cleanReferee) return null; // Prevent self-referral

    const referrals = loadReferrals();
    // Check if referee was already recorded
    const existing = referrals.find(r => r.referee_handle.toLowerCase() === cleanReferee.toLowerCase());
    if (existing) return existing;

    const record = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      referrer_handle: cleanReferrer,
      referee_handle: cleanReferee,
      referee_email: refereeEmail || '',
      referee_name: refereeName || '',
      status: 'PENDING',
      referrer_reward: 150,
      referee_reward: 150,
      created_at: new Date().toISOString(),
      approved_at: null,
      first_purchase_status: 'NONE',
      first_purchase_amount: 0,
      purchase_reward_credits: 0
    };

    referrals.push(record);
    saveReferrals(referrals);
    return record;
  },

  /**
   * Triggered when admin approves a user account:
   * Grants 150 Credits to Referrer + 150 Credits to Referee
   */
  async processApprovalRewards({ refereeHandle, refereeEmail, refereeUserId }) {
    const cleanReferee = '@' + (refereeHandle || '').replace(/^@/, '').toLowerCase().trim();
    const referrals = loadReferrals();
    const refIndex = referrals.findIndex(r => 
      r.referee_handle.toLowerCase() === cleanReferee.toLowerCase() ||
      (refereeEmail && r.referee_email.toLowerCase() === refereeEmail.toLowerCase())
    );

    if (refIndex === -1) return null;
    const ref = referrals[refIndex];

    if (ref.status === 'APPROVED') return ref; // Already processed

    ref.status = 'APPROVED';
    ref.approved_at = new Date().toISOString();

    // 1. Award +150 Credits to Referrer
    try {
      const referrerUser = await db.getUserByHandle(ref.referrer_handle);
      if (referrerUser) {
        await db.addCredits(
          referrerUser.id,
          150,
          'Referral Bonus',
          'Referral System',
          `Referral reward for inviting ${cleanReferee}`
        );
      }
    } catch (e) {
      console.warn('[Referral] Error rewarding referrer:', e.message);
    }

    // 2. Award +150 Credits to Referee
    try {
      const targetUserId = refereeUserId || (await db.getUserByHandle(cleanReferee))?.id;
      if (targetUserId) {
        await db.addCredits(
          targetUserId,
          150,
          'Referral Welcome Bonus',
          'Referral System',
          `Welcome bonus for joining via ${ref.referrer_handle}`
        );
      }
    } catch (e) {
      console.warn('[Referral] Error rewarding referee:', e.message);
    }

    saveReferrals(referrals);
    return ref;
  },

  /**
   * Reward Referrer when Referred User makes their first paid plan purchase
   */
  async recordPurchaseReward({ userHandle, userEmail, planPrice = 10, planName = 'Growth Plan' }) {
    const cleanUser = '@' + (userHandle || '').replace(/^@/, '').toLowerCase().trim();
    const referrals = loadReferrals();
    const refIndex = referrals.findIndex(r => 
      r.referee_handle.toLowerCase() === cleanUser.toLowerCase() ||
      (userEmail && r.referee_email.toLowerCase() === userEmail.toLowerCase())
    );

    if (refIndex === -1) return null;
    const ref = referrals[refIndex];

    if (ref.first_purchase_status === 'REWARDED') return ref; // One-time reward only

    // 10% of purchase price in credits (e.g. $10 plan * 10% = 1.0 or 1,000 credits equivalent)
    const priceNum = Number(planPrice) || 10;
    const rewardCredits = Math.round(priceNum * 100); // e.g. $10 -> 1,000 Credits reward!

    ref.first_purchase_status = 'REWARDED';
    ref.first_purchase_amount = priceNum;
    ref.purchase_reward_credits = rewardCredits;
    ref.purchased_at = new Date().toISOString();

    try {
      const referrerUser = await db.getUserByHandle(ref.referrer_handle);
      if (referrerUser) {
        await db.addCredits(
          referrerUser.id,
          rewardCredits,
          'Referral Purchase Reward',
          'Referral System',
          `10% First Purchase reward from ${cleanUser}'s ${planName} purchase ($${priceNum})`
        );
      }
    } catch (e) {
      console.warn('[Referral] Purchase reward error:', e.message);
    }

    saveReferrals(referrals);
    return ref;
  },

  /**
   * Get all referrals for Admin Dashboard
   */
  getAllReferrals() {
    return loadReferrals();
  },

  /**
   * Get summary for an individual user
   */
  getUserReferralStats(userHandle) {
    if (!userHandle) return { total: 0, approved: 0, pending: 0, totalEarned: 0, list: [] };
    const clean = '@' + userHandle.replace(/^@/, '').toLowerCase().trim();
    const referrals = loadReferrals();
    const myReferrals = referrals.filter(r => r.referrer_handle.toLowerCase() === clean.toLowerCase());

    const approved = myReferrals.filter(r => r.status === 'APPROVED');
    const pending = myReferrals.filter(r => r.status === 'PENDING');
    
    const approvalCredits = approved.length * 150;
    const purchaseCredits = approved.reduce((sum, r) => sum + (r.purchase_reward_credits || 0), 0);
    const totalEarned = approvalCredits + purchaseCredits;

    return {
      referrerHandle: clean,
      totalReferrals: myReferrals.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      totalEarnedCredits: totalEarned,
      referralLink: `https://atomxengage.com/ref/${clean.replace(/^@/, '')}`,
      list: myReferrals.map(r => ({
        user: r.referee_name || r.referee_handle,
        handle: r.referee_handle,
        status: r.status,
        date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent',
        approvalDate: r.approved_at ? new Date(r.approved_at).toLocaleDateString() : '—',
        reward: r.status === 'APPROVED' ? `150 + ${r.purchase_reward_credits || 0} Cr` : 'Pending'
      }))
    };
  }
};
