const express = require('express');
const multer = require('multer');
const router = express.Router();

// Configure multer for form data
const upload = multer();

let subscriptionService;
let emailService;

const initServices = (subService, emailSvc) => {
  subscriptionService = subService;
  emailService = emailSvc;
};

// Form-based API for email + address/pool subscription
router.post('/subscribe', upload.none(), async (req, res) => {
  try {
    const { email, address, poolAddress, notifications } = req.body;
    
    if (!email || (!address && !poolAddress)) {
      return res.status(400).json({ error: 'Email and either address or poolAddress are required' });
    }

    // Use poolAddress if provided, otherwise use address
    const targetAddress = poolAddress || address;
    const addressType = poolAddress ? 'pool' : 'wallet';

    // Parse notification types from form data
    let notificationTypes = ['swaps']; // default
    if (notifications) {
      if (typeof notifications === 'string') {
        notificationTypes = notifications.split(',').map(n => n.trim());
      } else if (Array.isArray(notifications)) {
        notificationTypes = notifications;
      }
    }

    const subscription = await subscriptionService.createSubscription(email, targetAddress, notificationTypes);
    
    if (emailService) {
      await emailService.sendSubscriptionConfirmation(email, targetAddress, addressType);
    }
    
    res.json({
      message: `Successfully subscribed to ${addressType} notifications`,
      email: subscription.email,
      address: subscription.address,
      address_type: addressType,
      notification_types: typeof subscription.notification_types === 'string' 
        ? JSON.parse(subscription.notification_types) 
        : subscription.notification_types,
      created: subscription.created_at
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ 
      error: 'Failed to create subscription',
      details: error.message 
    });
  }
});

// Legacy tracker endpoint (keep for backward compatibility)
router.post('/track', upload.none(), async (req, res) => {
  try {
    const { username, addresses, tokens, email } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Parse tracking data from form
    const trackingData = {};
    
    if (addresses) {
      trackingData.addresses = addresses.split(',').map(addr => addr.trim());
    }
    
    if (tokens) {
      trackingData.tokens = tokens.split(',').map(token => token.trim());
    }
    
    if (email) {
      trackingData.email = email.trim();
    }

    const tracker = await subscriptionService.createTracker(username, trackingData);
    
    res.json({
      message: 'Tracker created successfully',
      username: tracker.username,
      tracking: JSON.parse(tracker.tracking_data)
    });
  } catch (error) {
    console.error('Tracker creation error:', error);
    res.status(500).json({ error: 'Failed to create tracker' });
  }
});

router.get('/track/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const tracker = await subscriptionService.getTracker(username);
    
    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }
    
    res.json({
      username: tracker.username,
      tracking: JSON.parse(tracker.tracking_data),
      created: tracker.created_at
    });
  } catch (error) {
    console.error('Get tracker error:', error);
    res.status(500).json({ error: 'Failed to get tracker' });
  }
});

router.delete('/track/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const removed = await subscriptionService.removeTracker(username);
    
    if (!removed) {
      return res.status(404).json({ error: 'Tracker not found' });
    }
    
    res.json({
      message: 'Tracker removed successfully',
      username: removed.username
    });
  } catch (error) {
    console.error('Remove tracker error:', error);
    res.status(500).json({ error: 'Failed to remove tracker' });
  }
});

module.exports = { router, initServices };
