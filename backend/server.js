/**
 * ATOMX ENGAGE — MAIN SERVER ENTRY POINT
 * Premium AI Workspace Backend: Server-controlled Credits, OpenAI Isolation, Admin Control
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: false, // Permit fonts and dynamic scripts in single page application
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const configuredOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : ['*'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile apps, server-to-server) and browser extensions
    if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') || configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'x-admin-password', 'x-admin-key', 'x-user-handle', 'x-user-email']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI generation rate limit exceeded. Please wait a moment before sending another request.' }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

// Request Logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Apply Rate Limiters
app.use('/api/auth/', authLimiter);
app.use('/api/generate-reply', aiLimiter);
app.use('/api/ai/generate', aiLimiter);
app.use('/api/', generalLimiter);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ATOMX ENGAGE API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api', apiRoutes);

// Serve static frontend (checks local public/ first, then parent directory)
const fs = require('fs');
const frontendCandidates = [
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'backend', 'public'),
  path.join(process.cwd(), 'public'),
  path.join(__dirname, '..')
];
const frontendPath = frontendCandidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// Fallback to index.html for presentation SPA
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/health')) {
    return next();
  }
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send('<!DOCTYPE html><html><head><title>ATOMX ENGAGE</title></head><body style="background:#0b0f19;color:#fff;font-family:sans-serif;padding:40px;"><h2>ATOMX ENGAGE</h2><p>API & Backend Active.</p></body></html>');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  ⚡ ATOMX ENGAGE BACKEND SERVER RUNNING ON PORT ${PORT}`);
    console.log(`  🔗 Local API URL:    http://localhost:${PORT}/api`);
    console.log(`  🌐 Web App / SPA:    http://localhost:${PORT}`);
    console.log(`  🔒 Security Rules:   1 Credit = 1 AI Reply | Server Truth`);
    if (process.env.ADMIN_PASSWORD === 'atomx2026' || !process.env.ADMIN_PASSWORD) {
      console.warn(`  ⚠️  [SECURITY WARNING] Default ADMIN_PASSWORD ("atomx2026") is in use.`);
      console.warn(`  ⚠️  Set a strong, unique ADMIN_PASSWORD in backend/.env for production!`);
    }
    console.log(`======================================================\n`);
  });
}

module.exports = app;
