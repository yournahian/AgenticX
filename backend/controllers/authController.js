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

exports.requestAccess = async (req, res) => {
  const { fullName, email, handle, xHandle, password, useCase } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required' });
  }

  const rawHandle = (handle || xHandle || '').trim().replace(/^@/, '');
  if (!rawHandle) {
    return res.status(400).json({ error: 'Your X (Twitter) ID or handle is required to verify your account.' });
  }

  const formattedHandle = '@' + rawHandle;

  try {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const note = `X_ID:${formattedHandle} | Note: ${useCase || 'User access request'}`;
    await db.createAccessRequest(fullName, email, note, formattedHandle, password);

    res.status(201).json({
      message: `Access request submitted for ${formattedHandle}! Waiting for admin approval.`,
      status: 'PENDING',
      handle: formattedHandle
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

    if (!loginKey || !password) {
      return res.status(400).json({ error: 'Handle/Email and new password are required' });
    }

    // Find user in users table
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
      // If user not in users table yet, check if request is APPROVED in access_requests
      const requests = await db.getAccessRequests();
      const match = (requests || []).find(r => {
        const rHandle = (r.handle || '').replace(/^@/, '').toLowerCase();
        const rEmail = (r.email || '').toLowerCase();
        return rHandle === cleanHandle || rEmail === loginKey.toLowerCase();
      });

      if (match && match.status === 'APPROVED') {
        user = await db.approveAccessRequest(match.id);
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'Approved user not found. Please ensure admin has approved your request.' });
    }

    // Update password in database
    if (db.updateUserPassword) {
      await db.updateUserPassword(user.id, password);
    }

    const userHandle = user.handle ? (user.handle.startsWith('@') ? user.handle : '@' + user.handle) : `@${cleanHandle}`;

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
        plan: user.plan_tier,
        credits: user.credits || 100,
        maxCredits: user.credits || 100,
        avatar: user.avatar_initials
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Admin Login using Master Access Key from .env
exports.adminLogin = (req, res) => {
  const { accessKey } = req.body;
  const configuredKey = process.env.ADMIN_ACCESS_KEY || 'atomx-admin-key-2026';

  if (!accessKey || accessKey.trim() !== configuredKey.trim()) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Admin Access Key. Please check the ADMIN_ACCESS_KEY in your .env file.'
    });
  }

  res.json({
    success: true,
    token: `atomx_admin_token_${Date.now()}`,
    role: 'ADMIN',
    admin: {
      name: 'Evan Jawad (Owner)',
      email: 'evan@atomx.io',
      role: 'ADMIN',
      permissions: ['ALL_PERMISSIONS']
    },
    message: '✓ Admin authentication successful!'
  });
};

// Verify if an Admin Access Key is valid
exports.verifyAdminKey = (req, res) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  const configuredKey = process.env.ADMIN_ACCESS_KEY || 'atomx-admin-key-2026';
  const isValid = Boolean(key && key.trim() === configuredKey.trim());
  res.json({ valid: isValid });
};
