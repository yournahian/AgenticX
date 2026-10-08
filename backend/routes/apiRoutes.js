/**
 * ATOMX ENGAGE — API ROUTES
 */
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const creditController = require('../controllers/creditController');
const aiController = require('../controllers/aiController');
const campaignController = require('../controllers/campaignController');
const adminController = require('../controllers/adminController');

// API Root & Health Overview
router.get('/', (req, res) => {
  res.json({
    service: 'ATOMX ENGAGE — Multi-Provider API Network',
    status: 'online',
    version: '1.0.0',
    webApp: 'http://localhost:5000/',
    adminDashboard: 'http://localhost:5000/#admin',
    endpoints: {
      activeModel: '/api/admin/active-model',
      providers: '/api/providers',
      toneStyles: '/api/tone-styles',
      credits: '/api/credits/balance',
      engagedTweets: '/api/tweets/engaged'
    }
  });
});

// Auth & Access
router.post('/auth/login', authController.login);
router.post('/auth/admin-login', authController.adminLogin);
router.get('/auth/verify-admin-key', authController.verifyAdminKey);
router.post('/auth/request-access', authController.requestAccess);
router.get('/auth/check-status', authController.checkAccessStatus);
router.post('/auth/set-password', authController.setPassword);
router.get('/auth/me', authController.getCurrentUser);

// Server-Controlled Credits
router.get('/credits/balance', creditController.getBalance);
router.get('/credits/ledger', creditController.getLedger);

// AI Generation & Multi-Provider Engine
router.get('/providers', aiController.getProviders);
router.get('/providers/:provider/models', aiController.getProviderModels);
router.post('/generate-reply', aiController.generateReply);
router.post('/ai/generate', aiController.generateReply);

// Campaigns & Queue
router.get('/campaigns', campaignController.getCampaigns);
router.get('/queue', campaignController.getQueue);
router.post('/queue', campaignController.addToQueue);

// Smart Tweet Extraction, Format Normalization & Anti-Duplicate Engine
router.post('/tweets/parse-and-filter', campaignController.parseAndFilterTweets);
router.get('/tweets/engaged', campaignController.getEngagedTweets);
router.post('/tweets/mark-engaged', campaignController.markTweetsEngaged);
router.post('/tweets/clear-engaged', campaignController.clearEngagedTweets);

// Admin Control Panel
router.get('/admin/stats', adminController.getStats);
router.get('/admin/users', adminController.getUsers);
router.post('/admin/toggle-user-status', adminController.toggleUserStatus);
router.get('/admin/access-requests', adminController.getAccessRequests);
router.post('/admin/approve-request', adminController.approveRequest);
router.post('/admin/adjust-credits', adminController.adjustCredits);
router.get('/admin/plans', adminController.getPlans);
router.post('/admin/save-plans', adminController.savePlans);
router.get('/admin/ledger', adminController.getGlobalLedger);

// Curated Lists & Sorsa Score Targets Management
router.get('/curated-lists', adminController.getCuratedLists);
router.post('/admin/curated-lists', adminController.saveCuratedLists);

// Active AI Provider & Model Management
router.get('/admin/active-model', adminController.getActiveModel);
router.post('/admin/active-model', adminController.saveActiveModel);

// Dynamic AI API Keys Management
router.get('/admin/api-keys', adminController.getApiKeys);
router.post('/admin/api-keys', adminController.saveApiKey);

// Tone & Style Templates Management
router.get('/tone-styles', adminController.getToneStyles);
router.post('/admin/tone-styles', adminController.saveToneStyles);

// Live AI API Telemetry & Key Health Testing
router.get('/admin/api-logs', adminController.getApiLogs);
router.get('/admin/test-keys', adminController.testProviderKeys);

module.exports = router;
