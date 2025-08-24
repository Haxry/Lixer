class SubscriptionService {
  constructor(databaseService) {
    this.db = databaseService;
  }

  async createSubscription(email, address, notificationTypes = ['swaps']) {
    const query = `
      INSERT INTO email_subscriptions (email, address, notification_types, created_at, is_active)
      VALUES ($1, $2, $3, NOW(), true)
      ON CONFLICT (email, address) 
      DO UPDATE SET is_active = true, notification_types = $3, updated_at = NOW()
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      email.toLowerCase(), 
      address.toLowerCase(), 
      JSON.stringify(notificationTypes)
    ]);
    return result.rows[0];
  }

  async createTracker(username, trackingData) {
    const query = `
      INSERT INTO user_trackers (username, tracking_data, created_at, is_active)
      VALUES ($1, $2, NOW(), true)
      ON CONFLICT (username) 
      DO UPDATE SET tracking_data = $2, updated_at = NOW(), is_active = true
      RETURNING *
    `;
    
    const result = await this.db.query(query, [username.toLowerCase(), JSON.stringify(trackingData)]);
    return result.rows[0];
  }

  async getTracker(username) {
    const query = `
      SELECT username, tracking_data, created_at
      FROM user_trackers 
      WHERE username = $1 AND is_active = true
    `;
    
    const result = await this.db.query(query, [username.toLowerCase()]);
    return result.rows[0];
  }

  async getSubscriptionsForSwap(sender, recipient) {
    // Handle undefined/null values
    const senderAddr = sender ? sender.toLowerCase() : null;
    const recipientAddr = recipient ? recipient.toLowerCase() : null;
    
    if (!senderAddr && !recipientAddr) {
      return [];
    }
    
    const query = `
      SELECT email, address
      FROM email_subscriptions 
      WHERE (address = $1 OR address = $2) 
      AND is_active = true
    `;
    
    const result = await this.db.query(query, [senderAddr, recipientAddr]);
    return result.rows;
  }

  async getTrackersForSwap(sender, recipient) {
    const query = `
      SELECT username, tracking_data
      FROM user_trackers 
      WHERE is_active = true
    `;
    
    const result = await this.db.query(query);
    
    // Filter trackers that match the swap
    const matchingTrackers = result.rows.filter(tracker => {
      const data = JSON.parse(tracker.tracking_data);
      
      // Check if tracking addresses
      if (data.addresses && Array.isArray(data.addresses)) {
        return data.addresses.some(addr => 
          addr.toLowerCase() === sender.toLowerCase() || 
          addr.toLowerCase() === recipient.toLowerCase()
        );
      }
      
      // Check if tracking tokens
      if (data.tokens && Array.isArray(data.tokens)) {
        // This would need token data from swap to match
        return false;
      }
      
      return false;
    });
    
    return matchingTrackers;
  }

  async removeTracker(username) {
    const query = `
      UPDATE user_trackers 
      SET is_active = false, updated_at = NOW()
      WHERE username = $1
      RETURNING *
    `;
    
    const result = await this.db.query(query, [username.toLowerCase()]);
    return result.rows[0];
  }

  async createSubscriptionTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS email_subscriptions (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        address VARCHAR(42) NOT NULL,
        notification_types JSONB DEFAULT '["swaps"]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true,
        UNIQUE(email, address)
      );
      
      CREATE INDEX IF NOT EXISTS idx_email_subscriptions_address 
      ON email_subscriptions(address) WHERE is_active = true;
      
      CREATE INDEX IF NOT EXISTS idx_email_subscriptions_email 
      ON email_subscriptions(email) WHERE is_active = true;
      
      -- Create trigger function for new subscriptions
      CREATE OR REPLACE FUNCTION notify_new_subscription()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('new_subscription', json_build_object(
          'id', NEW.id,
          'email', NEW.email,
          'address', NEW.address,
          'notification_types', NEW.notification_types,
          'action', 'created'
        )::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      -- Create trigger
      DROP TRIGGER IF EXISTS subscription_insert_trigger ON email_subscriptions;
      CREATE TRIGGER subscription_insert_trigger
      AFTER INSERT ON email_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION notify_new_subscription();
    `;
    
    await this.db.query(query);
    console.log('Email subscriptions table created/verified with LISTEN/NOTIFY');
  }

  async createTrackerTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS user_trackers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        tracking_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_trackers_username 
      ON user_trackers(username) WHERE is_active = true;
      
      CREATE INDEX IF NOT EXISTS idx_user_trackers_data 
      ON user_trackers USING GIN(tracking_data) WHERE is_active = true;
    `;
    
    await this.db.query(query);
    console.log('User trackers table created/verified');
  }
}

module.exports = SubscriptionService;
