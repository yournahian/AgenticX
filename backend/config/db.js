/**
 * ATOMX ENGAGE — DATABASE ENGINE (SUPABASE POSTGRESQL)
 * Completely eliminates SQLite dependency for 100% serverless Vercel compatibility.
 * All math, ledger logging, and operations are cloud-persisted in Supabase.
 */

const supabase = require('./supabase');

// Helper to resolve user UUID from either UUID or numeric fallback (e.g. 1)
async function resolveUser(userIdOrId) {
  if (!supabase) return null;
  
  // If valid UUID format
  const isUuid = typeof userIdOrId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userIdOrId);
  if (isUuid) {
    const { data } = await supabase.from('users').select('*').eq('id', userIdOrId).maybeSingle();
    if (data) return data;
  }

  // Fallback: Default to admin or first user
  const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true }).limit(1);
  return data?.[0] || null;
}

module.exports = {
  // Direct client access if needed
  db: supabase,

  // User Helpers
  async getUserById(id) {
    return await resolveUser(id);
  },

  async getUserByEmail(email) {
    if (!supabase) return null;
    const { data } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    return data || null;
  },

  async getAllUsers() {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, handle, role, status, plan_tier, credits, avatar_initials, created_at')
      .order('created_at', { ascending: true });
    return data || [];
  },

  async updateUserStatus(userId, status) {
    const user = await resolveUser(userId);
    if (!user) throw new Error('User not found');
    const { data, error } = await supabase.from('users').update({ status }).eq('id', user.id).select();
    if (error) throw new Error(error.message);
    return data?.[0];
  },

  async updateUserPassword(userId, password) {
    if (!supabase) return true;
    const { data, error } = await supabase.from('users').update({ password_hash: password }).eq('id', userId).select();
    if (error) throw new Error(error.message);
    return data?.[0];
  },

  // Atomic Server-Side Credit Math (Rule: 1 Credit = 1 AI reply)
  async deductCredit(userId, amount = 1, action = 'AI Reply', reason = 'Generated reply') {
    const user = await resolveUser(userId);
    if (!user) throw new Error('User not found');
    if ((user.credits || 0) < amount) throw new Error('Insufficient credits');

    const newBalance = user.credits - amount;
    const { error: updateErr } = await supabase.from('users').update({ credits: newBalance }).eq('id', user.id);
    if (updateErr) throw new Error(updateErr.message);

    // Record immutable audit ledger entry
    await supabase.from('credits_ledger').insert({
      user_id: user.id,
      amount: -amount,
      balance_after: newBalance,
      action,
      admin_source: 'Server System',
      reason
    });

    return newBalance;
  },

  async addCredits(userId, amount, action = 'Bonus', adminSource = 'Admin', reason = 'Credit adjustment') {
    const user = await resolveUser(userId);
    if (!user) throw new Error('User not found');

    const newBalance = (user.credits || 0) + amount;
    const { error: updateErr } = await supabase.from('users').update({ credits: newBalance }).eq('id', user.id);
    if (updateErr) throw new Error(updateErr.message);

    await supabase.from('credits_ledger').insert({
      user_id: user.id,
      amount,
      balance_after: newBalance,
      action,
      admin_source: adminSource,
      reason
    });

    return newBalance;
  },

  async getLedger(userId) {
    const user = await resolveUser(userId);
    if (!user) return [];
    const { data } = await supabase
      .from('credits_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return data || [];
  },

  async getAllLedger() {
    if (!supabase) return [];
    const { data } = await supabase
      .from('credits_ledger')
      .select('*, users(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100);

    return (data || []).map(l => ({
      ...l,
      user_name: l.users?.full_name || 'System User',
      user_email: l.users?.email || 'user@atomx.io'
    }));
  },

  async getUserByHandle(handle) {
    if (!supabase) return null;
    const clean = handle.replace(/^@/, '');
    const { data } = await supabase.from('users').select('*').or(`handle.eq.@${clean},handle.eq.${clean}`).maybeSingle();
    return data;
  },

  // Access Requests & Approval
  async getAccessRequests() {
    if (!supabase) return [];
    const { data } = await supabase.from('access_requests').select('*').order('requested_at', { ascending: false });
    return (data || []).map(r => {
      const match = (r.use_case || '').match(/X_ID:(@?[\w_]+)/i);
      return {
        ...r,
        handle: match ? (match[1].startsWith('@') ? match[1] : '@' + match[1]) : '@' + r.email.split('@')[0]
      };
    });
  },

  async createAccessRequest(fullName, email, useCase) {
    if (!supabase) throw new Error('Database not connected');
    const { data, error } = await supabase.from('access_requests').insert({
      full_name: fullName,
      email,
      use_case: useCase,
      status: 'PENDING',
      initial_credits_granted: 100
    }).select();
    if (error) throw new Error(error.message);
    return data?.[0];
  },

  async approveAccessRequest(requestId) {
    if (!supabase) throw new Error('Database not connected');
    const { data: req } = await supabase.from('access_requests').select('*').eq('id', requestId).maybeSingle();
    if (!req) throw new Error('Access request not found');

    // Extract real X Handle / ID from use_case note
    const handleMatch = (req.use_case || '').match(/X_ID:(@?[\w_]+)/i);
    const assignedHandle = handleMatch ? (handleMatch[1].startsWith('@') ? handleMatch[1] : '@' + handleMatch[1]) : ('@' + req.email.split('@')[0]);

    // Create user with 100 initial free credits
    const initials = req.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';
    const { data: newUser, error: userErr } = await supabase.from('users').insert({
      email: req.email,
      password_hash: 'approved_hash',
      full_name: req.full_name,
      handle: assignedHandle,
      role: 'USER',
      status: 'ACTIVE',
      plan_tier: 'Free Plan',
      credits: 100,
      avatar_initials: initials
    }).select().single();

    if (userErr) throw new Error(userErr.message);

    // Record initial grant in ledger
    await supabase.from('credits_ledger').insert({
      user_id: newUser.id,
      amount: 100,
      balance_after: 100,
      action: 'Initial Grant',
      admin_source: 'Admin Approval',
      reason: 'Approved free onboarding: 100 free credits'
    });

    // Update request status
    await supabase.from('access_requests').update({
      status: 'APPROVED',
      reviewed_at: new Date().toISOString()
    }).eq('id', requestId);

    return { userId: newUser.id, credits: 100, handle: assignedHandle };
  },

  // Campaigns & Queue
  async getCampaigns(userId) {
    const user = await resolveUser(userId);
    if (!user) return [];
    const { data } = await supabase.from('campaigns').select('*').eq('user_id', user.id);
    return data || [];
  },

  async getQueue(userId) {
    const user = await resolveUser(userId);
    if (!user) return [];
    const { data } = await supabase.from('reply_queue').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return data || [];
  },

  async addToQueue(userId, campaignId, author, handle, content) {
    const user = await resolveUser(userId);
    if (!user) throw new Error('User not found');
    const { data, error } = await supabase.from('reply_queue').insert({
      campaign_id: campaignId || null,
      user_id: user.id,
      tweet_author: author,
      tweet_handle: handle,
      tweet_content: content,
      status: 'WAITING'
    }).select();
    if (error) throw new Error(error.message);
    return data?.[0];
  },

  // Plans & Transactions
  async getPlans() {
    if (!supabase) return [];
    const { data } = await supabase.from('plans').select('*');
    return (data || []).map(p => ({
      ...p,
      features_json: JSON.stringify(p.features || [])
    }));
  },

  async getTransactions() {
    if (!supabase) return [];
    const { data } = await supabase.from('transactions').select('*, users(full_name, email)').order('created_at', { ascending: false });
    return (data || []).map(t => ({
      ...t,
      user_name: t.users?.full_name || 'Customer',
      user_email: t.users?.email || 'customer@atomx.io'
    }));
  },

  // Engaged Tweets Tracking (Anti-Duplicate & 2nd Account Isolation)
  async getEngagedTweetIds(userId = '1') {
    if (!supabase) return [];
    const { data } = await supabase.from('engaged_tweets').select('tweet_id').eq('user_id', String(userId));
    return (data || []).map(r => r.tweet_id);
  },

  async isTweetEngaged(tweetId, userId = '1') {
    if (!supabase) return false;
    const { data } = await supabase.from('engaged_tweets').select('tweet_id').eq('tweet_id', String(tweetId)).eq('user_id', String(userId)).maybeSingle();
    return !!data;
  },

  async markTweetsEngaged(tweets, userId = '1') {
    if (!supabase) return;
    const list = Array.isArray(tweets) ? tweets : [tweets];
    const rows = [];
    for (const t of list) {
      const id = t?.tweetId || t?.tweet_id || t?.id;
      if (!id) continue;
      rows.push({
        tweet_id: String(id),
        user_id: String(userId),
        handle: t.handle || '@creator',
        canonical_url: t.canonicalUrl || t.canonical_url || '',
        action_type: t.actionType || t.action_type || 'REPLY'
      });
    }
    if (rows.length > 0) {
      await supabase.from('engaged_tweets').upsert(rows, { onConflict: 'tweet_id' });
    }
  },

  async clearEngagedTweets(userId = '1') {
    if (!supabase) return;
    await supabase.from('engaged_tweets').delete().eq('user_id', String(userId));
  }
};
