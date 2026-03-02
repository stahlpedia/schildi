const express = require('express');
const webpush = require('web-push');
const db = require('../db');
const { authenticate } = require('../auth');

const router = express.Router();

// Initialize VAPID keys on first load
let vapidKeys = null;

async function initVapidKeys() {
  // Check if VAPID keys exist in database
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('vapid_keys');
  
  if (existing) {
    vapidKeys = JSON.parse(existing.value);
  } else {
    // Generate new VAPID keys
    vapidKeys = webpush.generateVAPIDKeys();
    
    // Store in database
    db.prepare('INSERT OR REPLACE INTO settings (key, value, created_at) VALUES (?, ?, datetime("now"))').run(
      'vapid_keys',
      JSON.stringify(vapidKeys)
    );
  }
  
  // Configure web-push
  webpush.setVapidDetails(
    'mailto:push@schildi-dashboard.local',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
}

// Initialize VAPID keys
initVapidKeys().catch(console.error);

/**
 * Get VAPID public key for client subscription
 */
router.get('/vapid-key', (req, res) => {
  if (!vapidKeys) {
    return res.status(500).json({ error: 'VAPID keys not initialized' });
  }
  
  res.json({ publicKey: vapidKeys.publicKey });
});

/**
 * Subscribe to push notifications
 */
router.post('/subscribe', authenticate, (req, res) => {
  try {
    const subscription = req.body;
    // db already imported;
    
    // Validate subscription object
    if (!subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    
    // Insert or update subscription
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions 
      (endpoint, keys_p256dh, keys_auth, created_at) 
      VALUES (?, ?, ?, datetime("now"))
    `).run(
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    );
    
    res.json({ success: true, message: 'Push subscription saved' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/**
 * Unsubscribe from push notifications
 */
router.delete('/subscribe', authenticate, (req, res) => {
  try {
    const { endpoint } = req.body;
    // db already imported;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint required' });
    }
    
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    
    res.json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

/**
 * Send push notification to all subscriptions
 */
async function sendPushToAll(payload) {
  if (!vapidKeys) {
    console.warn('VAPID keys not initialized, skipping push notifications');
    return;
  }
  
  try {
    // db already imported;
    const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();
    
    const pushPromises = subscriptions.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth
        }
      };
      
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (error) {
        console.error('Push send error for subscription:', error);
        
        // Remove invalid subscriptions (410 = Gone)
        if (error.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
          console.log('Removed invalid push subscription:', sub.endpoint);
        }
      }
    });
    
    await Promise.all(pushPromises);
    console.log(`Push notifications sent to ${subscriptions.length} subscribers`);
  } catch (error) {
    console.error('Send push to all error:', error);
  }
}

module.exports = { router, sendPushToAll };