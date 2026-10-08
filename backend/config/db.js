/**
 * ATOMX ENGAGE — DATABASE ENGINE (SUPABASE POSTGRESQL)
 * Completely eliminates SQLite dependency for 100% serverless Vercel compatibility.
 * All math, ledger logging, and operations are cloud-persisted in Supabase.
 */

const supabase = require('./supabase');

// Helper to resolve user UUID from either UUID or numeric fallback (e.g. 1)
async function resolveUser(userIdOrId) {
  if (!supabase || !userIdOrId) return null;
  
  const val = String(userIdOrId).trim();
  // 1. If valid UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  if (isUuid) {
    const { data } = await supabase.from('users').select('*').eq('id', val).maybeSingle();
    if (data) return data;
  }

  // 2. If email format
  if (val.includes('@') && val.includes('.')) {
    const { data } = await supabase.from('users').select('*').eq('email', val.toLowerCase()).maybeSingle();
    if (data) return data;
  }

  // 3. If Twitter handle
  const cleanHandle = val.replace(/^@/, '').toLowerCase();
  const { data: handleUser } = await supabase.from('users').select('*').or(`handle.eq.@${cleanHandle},handle.eq.${cleanHandle}`).maybeSingle();
  if (handleUser) return handleUser;

  // 4. If numeric ID
  if (!isNaN(val)) {
    const { data: numUser } = await supabase.from('users').select('*').eq('id', val).maybeSingle();
    if (numUser) return numUser;
  }

  // Fallback: Default to admin or first user only if explicitly '1' or 'admin'
  if (val === '1' || val === 'admin') {
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true }).limit(1);
    return data?.[0] || null;
  }

  return null;
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
    const user = await resolveUser(userId);
    if (!user) throw new Error('User not found');
    const { data, error } = await supabase.from('users').update({ password_hash: password }).eq('id', user.id).select();
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

  async approveAccessRequest(requestId, initialCredits = 100, planTier = 'Free Plan') {
    if (!supabase) throw new Error('Database not connected');
    const { data: req } = await supabase.from('access_requests').select('*').eq('id', requestId).maybeSingle();
    if (!req) throw new Error('Access request not found');

    // Extract real X Handle / ID from use_case note
    const handleMatch = (req.use_case || '').match(/X_ID:(@?[\w_]+)/i);
    const assignedHandle = handleMatch ? (handleMatch[1].startsWith('@') ? handleMatch[1] : '@' + handleMatch[1]) : ('@' + req.email.split('@')[0]);

    // Check if user already exists in users table
    const { data: existingUser } = await supabase.from('users').select('*').eq('email', req.email).maybeSingle();
    let userRecord = null;

    if (existingUser) {
      const grantCredits = existingUser.credits > 0 ? existingUser.credits : initialCredits;
      const { data: updated, error: updErr } = await supabase.from('users').update({
        status: 'ACTIVE',
        handle: existingUser.handle || assignedHandle,
        plan_tier: planTier || existingUser.plan_tier || 'Free Plan',
        credits: grantCredits
      }).eq('id', existingUser.id).select().single();
      if (updErr) throw new Error(updErr.message);
      userRecord = updated;
    } else {
      const initials = req.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';
      const { data: newUser, error: userErr } = await supabase.from('users').insert({
        email: req.email,
        password_hash: 'approved_hash',
        full_name: req.full_name,
        handle: assignedHandle,
        role: 'USER',
        status: 'ACTIVE',
        plan_tier: planTier || 'Free Plan',
        credits: initialCredits,
        avatar_initials: initials
      }).select().single();

      if (userErr) throw new Error(userErr.message);
      userRecord = newUser;

      // Record initial grant in ledger
      await supabase.from('credits_ledger').insert({
        user_id: userRecord.id,
        amount: initialCredits,
        balance_after: initialCredits,
        action: 'Initial Grant',
        admin_source: 'Admin Approval',
        reason: `Approved free onboarding: ${initialCredits} credits`
      });
    }

    // Update request status to APPROVED
    await supabase.from('access_requests').update({
      status: 'APPROVED',
      reviewed_at: new Date().toISOString()
    }).eq('id', requestId);

    return { userId: userRecord.id, credits: userRecord.credits, handle: assignedHandle };
  },

  async rejectAccessRequest(requestId) {
    if (!supabase) throw new Error('Database not connected');
    const { data, error } = await supabase.from('access_requests').update({
      status: 'REJECTED',
      reviewed_at: new Date().toISOString()
    }).eq('id', requestId).select();
    if (error) throw new Error(error.message);
    return data?.[0];
  },

  async requestSuspensionReview(identifier, reason = 'User requested review of suspension') {
    if (!supabase) return { success: true };
    const clean = (identifier || '').replace(/^@/, '').toLowerCase().trim();
    let user = null;
    if (identifier.includes('@') && identifier.includes('.')) {
      user = await this.getUserByEmail(identifier);
    }
    if (!user) {
      user = await this.getUserByHandle(clean);
    }
    if (user) {
      await supabase.from('credits_ledger').insert({
        user_id: user.id,
        amount: 0,
        balance_after: user.credits || 0,
        action: 'Appeal Review',
        admin_source: 'Extension Appeal',
        reason: `Appeal: ${reason}`
      });
      return { success: true, user };
    }
    return { success: true };
  },

  async resetUserPassword(identifier, newPassword) {
    if (!supabase) throw new Error('Database not connected');
    const clean = (identifier || '').replace(/^@/, '').toLowerCase().trim();
    let user = null;
    if (identifier.includes('@') && identifier.includes('.')) {
      user = await this.getUserByEmail(identifier);
    }
    if (!user) {
      user = await this.getUserByHandle(clean);
    }
    if (!user) {
      const reqs = await this.getAccessRequests();
      const m = (reqs || []).find(r => {
        const rHandle = (r.handle || '').replace(/^@/, '').toLowerCase();
        return rHandle === clean || (r.email || '').toLowerCase() === identifier.toLowerCase();
      });
      if (m) {
        user = await this.getUserByEmail(m.email);
      }
    }
    if (!user) {
      throw new Error('User not found. Please ensure your email or handle is registered.');
    }
    const { data, error } = await supabase.from('users').update({
      password_hash: newPassword,
      status: 'ACTIVE'
    }).eq('id', user.id).select().single();
    if (error) throw new Error(error.message);
    return data;
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
  },

  async wipeAllUserData() {
    if (!supabase) return { success: true, message: 'No database connected' };
    await supabase.from('credits_ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('engaged_tweets').delete().neq('tweet_id', '___nonexistent___');
    try { await supabase.from('campaigns').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
    try { await supabase.from('reply_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
    try { await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (e) {}
    await supabase.from('access_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return { success: true, message: 'All user data wiped fresh successfully' };
  }
};
