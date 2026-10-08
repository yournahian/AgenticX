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
