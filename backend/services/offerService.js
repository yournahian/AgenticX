/**
 * ATOMX ENGAGE — PROMOTIONAL OFFERS SERVICE
 * Handles "FIRST LAUNCH OFFER" / "FOUNDING 100" with countdown timers and admin controls
 */

const fs = require('fs');
const path = require('path');

const OFFERS_FILE = path.join(__dirname, '../data/specialOffers.json');

function ensureDataDir() {
  const dir = path.dirname(OFFERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDefaultOffer() {
  // Default: Founding 100 Launch Offer expiring in 3 days
  const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'launch_founding_100',
    name: 'FOUNDING 100',
    badge: 'FIRST LAUNCH OFFER',
    originalPrice: 5.00,
    launchPrice: 2.00,
    credits: 5000,
    limitUsers: 100,
    claimedUsers: 14,
    isActive: true,
    expiresAt: expiry,
    createdAt: new Date().toISOString(),
    features: [
      '5,000 AI replies',
      'All automation agents',
      'Human-like pacing',
      'Priority processing',
      'Early feature access',
      'Dedicated support'
    ]
  };
}

function loadOffer() {
  ensureDataDir();
  try {
    if (fs.existsSync(OFFERS_FILE)) {
      const raw = fs.readFileSync(OFFERS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  const def = getDefaultOffer();
  saveOffer(def);
  return def;
}

function saveOffer(offer) {
  ensureDataDir();
  fs.writeFileSync(OFFERS_FILE, JSON.stringify(offer, null, 2), 'utf8');
}

module.exports = {
  getCurrentOffer() {
    const offer = loadOffer();
    const now = Date.now();
    const expiryTime = new Date(offer.expiresAt).getTime();
    const isExpired = now >= expiryTime;

    return {
      ...offer,
      isExpired,
      secondsRemaining: Math.max(0, Math.floor((expiryTime - now) / 1000))
    };
  },

  updateOffer(updates) {
    const current = loadOffer();
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveOffer(updated);
    return updated;
  }
};
