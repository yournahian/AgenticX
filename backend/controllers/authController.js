/**
 * ATOMX ENGAGE — AUTH CONTROLLER (SUPABASE PERSISTENT)
 */
const db = require('../config/db');

exports.login = async (req, res) => {
  try {
    const { identifier, email, handle, xHandle, username, password } = req.body;
    const loginKey = (identifier || email || handle || xHandle || username || 'evan@atomx.io').trim();
    const cleanHandle = loginKey.replace(/^@/, '').toLowerCase();

    let user = null;
    if (loginKey.includes('@') && loginKey.includes('.')) {
      user = await db.getUserByEmail(loginKey);
    }
    if (!user && db.getUserByHandle) {
      user = await db.getUserByHandle(cleanHandle);
    }
    if (!user) {
      user = await db.getUserByEmail(loginKey);
    }
    if (!user) {
      // Default fallback to primary user if no match found
      user = await db.getUserById(1);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please submit an access request with your X ID.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Account Suspended',
        message: 'Your account is currently suspended. Please contact support@atomx.io to appeal.'
      });
    }

    const userHandle = user.handle ? (user.handle.startsWith('@') ? user.handle : '@' + user.handle) : `@${cleanHandle || 'user'}`;

    res.json({
      token: `atomx_session_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        handle: userHandle,
        role: user.role,
        status: user.status,
        plan: user.plan_tier,
        credits: user.credits,
        maxCredits: user.credits,
        avatar: user.avatar_initials
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const referralService = require('../services/referralService');

exports.requestAccess = async (req, res) => {
  const { fullName, email, handle, xHandle, password, useCase, telegram, referredBy, ref } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required' });
  }

  const rawHandle = (handle || xHandle || '').trim().replace(/^@/, '');
  if (!rawHandle) {
    return res.status(400).json({ error: 'Your X (Twitter) ID or handle is required to verify your account.' });
  }

  const formattedHandle = '@' + rawHandle;
  const rawTelegram = (telegram || '').trim();
  const formattedTelegram = rawTelegram ? (rawTelegram.startsWith('@') ? rawTelegram : '@' + rawTelegram) : '';

  const rawReferrer = (referredBy || ref || '').trim().replace(/^@/, '');
  const formattedReferrer = rawReferrer && rawReferrer.toLowerCase() !== rawHandle.toLowerCase() ? '@' + rawReferrer : '';

  try {
    // 1. Strict 1 account per email
    const existingEmail = await db.getUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // 2. Strict 1 account per X ID (Enforce zero duplicate X accounts)
    const existingHandleUser = await db.getUserByHandle(rawHandle);
    if (existingHandleUser) {
      return res.status(400).json({ 
        error: `This Twitter / X handle (${formattedHandle}) is already registered to an account. Each X account can only be linked once.` 
      });
    }

    // 3. Check for existing pending request with this X ID
    const existingReqs = await db.getAccessRequests();
    const duplicateReq = (existingReqs || []).find(r => {
      const h = (r.handle || '').replace(/^@/, '').toLowerCase();
      return h === rawHandle.toLowerCase() && (r.status === 'PENDING' || r.status === 'APPROVED');
    });
    if (duplicateReq) {
      return res.status(400).json({ 
        error: `An access request for ${formattedHandle} has already been submitted (${duplicateReq.status}). Multiple accounts with the same X ID are strictly prohibited.` 
      });
    }

    const note = `X_ID:${formattedHandle}${formattedTelegram ? ` | TG:${formattedTelegram}` : ''}${formattedReferrer ? ` | REF:${formattedReferrer}` : ''} | Note: ${useCase || 'User access request'}`;
    await db.createAccessRequest(fullName, email, note, formattedHandle, password);

    // 4. Record pending referral if referred
    if (formattedReferrer) {
      referralService.recordPendingReferral({
        referrerHandle: formattedReferrer,
        refereeHandle: formattedHandle,
        refereeEmail: email,
        refereeName: fullName
      });
    }

    res.status(201).json({
      message: `Access request submitted for ${formattedHandle}! Waiting for admin approval.`,
      status: 'PENDING',
      handle: formattedHandle,
      telegram: formattedTelegram,
      referredBy: formattedReferrer || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.checkAccessStatus = async (req, res) => {
  try {
    const rawHandle = (req.query.handle || req.query.xHandle || '').trim().replace(/^@/, '').toLowerCase();
    const email = (req.query.email || '').trim().toLowerCase();

    if (!rawHandle && !email) {
      return res.status(400).json({ error: 'Please provide handle or email to check status' });
    }

    // 1. Check if user already exists and is active in users table
    let user = null;
    if (rawHandle && db.getUserByHandle) {
      user = await db.getUserByHandle(rawHandle);
    }
    if (!user && email && db.getUserByEmail) {
      user = await db.getUserByEmail(email);
    }

    if (user) {
      const userHandle = user.handle ? (user.handle.startsWith('@') ? user.handle : '@' + user.handle) : `@${rawHandle}`;
      const needsPasswordSetup = !user.password_hash || user.password_hash === 'approved_hash';
      return res.json({
        status: user.status === 'ACTIVE' ? 'APPROVED' : user.status,
        handle: userHandle,
        email: user.email,
        fullName: user.full_name,
        needsPasswordSetup,
        credits: user.credits,
        plan: user.plan_tier
      });
    }

    // 2. Check access_requests table
    const requests = await db.getAccessRequests();
    const match = (requests || []).find(r => {
      const rHandle = (r.handle || '').replace(/^@/, '').toLowerCase();
      const rEmail = (r.email || '').toLowerCase();
      return (rawHandle && rHandle === rawHandle) || (email && rEmail === email);
    });

    if (match) {
      return res.json({
        status: match.status, // 'PENDING', 'APPROVED', or 'REJECTED'
        handle: match.handle,
        email: match.email,
        fullName: match.full_name,
        needsPasswordSetup: match.status === 'APPROVED'
      });
    }

    res.json({ status: 'NOT_FOUND' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setPassword = async (req, res) => {
  try {
    const { identifier, handle, email, password } = req.body;
    const loginKey = (identifier || handle || email || '').trim();
    const cleanHandle = loginKey.replace(/^@/, '').toLowerCase();
    const inputEmail = (email || (loginKey.includes('@') ? loginKey : '')).trim().toLowerCase();

    if (!loginKey || !password) {
      return res.status(400).json({ error: 'Handle/Email and new password are required' });
    }

    // Find user in users table
    let user = null;
    if (inputEmail) {
      user = await db.getUserByEmail(inputEmail);
    }
    if (!user && cleanHandle && db.getUserByHandle) {
      user = await db.getUserByHandle(cleanHandle);
    }
    if (!user && loginKey) {
      user = await db.getUserByEmail(loginKey);
    }

    if (!user) {
      // Check if request is in access_requests
      const requests = await db.getAccessRequests();
      const match = (requests || []).find(r => {
        const rHandle = (r.handle || '').replace(/^@/, '').toLowerCase();
        const rEmail = (r.email || '').toLowerCase();
        return (cleanHandle && rHandle === cleanHandle) || 
               (inputEmail && rEmail === inputEmail) || 
               (loginKey && rEmail === loginKey.toLowerCase());
      });

      if (match) {
        if (match.status === 'APPROVED' || match.status === 'PENDING') {
          const approvedRes = await db.approveAccessRequest(match.id);
          user = await db.getUserById(approvedRes.userId);
        }
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'Approved account not found. Please ensure your request has been submitted.' });
    }

    // Update password in database and set ACTIVE
    if (db.updateUserPassword) {
      await db.updateUserPassword(user.id, password);
    }
    if (db.updateUserStatus) {
      await db.updateUserStatus(user.id, 'ACTIVE');
    }

    // Reload fresh user
    user = await db.getUserById(user.id) || user;

    const userHandle = user.handle ? (user.handle.startsWith('@') ? user.handle : '@' + user.handle) : (cleanHandle ? `@${cleanHandle}` : '@user');

    res.json({
      success: true,
      message: '✓ Password set successfully! You are now logged in.',
      token: `atomx_session_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        handle: userHandle,
        role: user.role,
        status: 'ACTIVE',
        plan: user.plan_tier || 'Free Plan',
        credits: user.credits !== undefined ? user.credits : 100,
        maxCredits: user.credits !== undefined ? user.credits : 100,
        avatar: user.avatar_initials || 'UX'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.requestReview = async (req, res) => {
  try {
    const { handle, email, reason } = req.body;
    const identifier = handle || email || 'user';
    await db.requestSuspensionReview(identifier, reason || 'Account suspension review requested from extension');
    res.json({
      success: true,
      message: 'Review request submitted to Administrator. Please await manual review.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { identifier, email, handle, newPassword } = req.body;
    const loginKey = (identifier || email || handle || '').trim();
    if (!loginKey || !newPassword) {
      return res.status(400).json({ error: 'Account handle/email and new password are required' });
    }
    const updatedUser = await db.resetUserPassword(loginKey, newPassword);
    res.json({
      success: true,
      message: '✓ Password reset successfully! You can now log in with your new password.',
      handle: updatedUser.handle
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;
    const user = await db.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      handle: user.handle,
      role: user.role,
      status: user.status,
      plan: user.plan_tier,
      credits: user.credits,
      maxCredits: user.credits,
      avatar: user.avatar_initials
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin Login using Password / Master Access Key from .env
exports.adminLogin = (req, res) => {
  const { password, accessKey } = req.body;
  const input = (password || accessKey || '').trim();
  const configuredPassword = (process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_KEY || 'atomx2026').trim();

  if (!input || input !== configuredPassword) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Admin Password. Please check the ADMIN_PASSWORD in your backend .env file.'
    });
  }

  res.json({
    success: true,
    token: `atomx_admin_token_${Date.now()}`,
    role: 'ADMIN',
    admin: {
      name: 'Administrator',
      email: 'admin@atomx.io',
      role: 'ADMIN',
      permissions: ['ALL_PERMISSIONS']
    },
    message: '✓ Admin authentication successful!'
  });
};

// Verify if an Admin Password / Key is valid
exports.verifyAdminKey = (req, res) => {
  const key = req.headers['x-admin-password'] || req.headers['x-admin-key'] || req.query.password || req.query.key;
  const configuredPassword = (process.env.ADMIN_PASSWORD || process.env.ADMIN_ACCESS_KEY || 'atomx2026').trim();
  const isValid = Boolean(key && key.trim() === configuredPassword);
  res.json({ valid: isValid });
};
