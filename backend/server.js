/**
 * ATOMX ENGAGE — MAIN SERVER ENTRY POINT
 * Premium AI Workspace Backend: Server-controlled Credits, OpenAI Isolation, Admin Control
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

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
    console.log(`======================================================\n`);
  });
}

module.exports = app;
