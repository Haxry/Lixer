const { Client } = require('pg');

class DatabaseService {
  constructor() {
    this.client = null;
    this.notifyClient = null;
    this.connectionString = process.env.DATABASE_URL;
    this.listeners = new Set();
    this.subscriptionListeners = new Set();
    }

  async connect() {
    try {
      this.client = new Client({
        connectionString: this.connectionString,
        ssl: {
          rejectUnauthorized: false
        },
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        query_timeout: 30000
      });
      
      await this.client.connect();
      console.log('Connected to PostgreSQL database');
      return true;
    } catch (error) {
      console.error('Database connection error:', error.message);
      console.log('Checking if this is a network/DNS issue...');
      
      try {
        const url = new URL(this.connectionString);
        console.log(`Trying to connect to: ${url.hostname}:${url.port}`);
        console.log(`Database: ${url.pathname.substring(1)}`);
      } catch (parseError) {
        console.log('Could not parse connection string');
      }
      
      return false;
    }
  }

  async disconnect() {
    if (this.notifyClient) {
      await this.notifyClient.end();
      console.log('Disconnected from notify client');
    }
    if (this.client) {
      await this.client.end();
      console.log('Disconnected from database');
    }
  }

  async setupRealtimeNotifications() {
    try {
      this.notifyClient = new Client({
        connectionString: this.connectionString,
        ssl: {
          rejectUnauthorized: false
        }
      });
      
      await this.notifyClient.connect();
      
      await this.notifyClient.query(`
        CREATE OR REPLACE FUNCTION notify_swap_insert()
        RETURNS TRIGGER AS $$
        BEGIN
          PERFORM pg_notify('new_swap', json_build_object(
            'id', NEW.id,
            'block_number', NEW.block_number,
            'transaction_hash', NEW.transaction_hash,
            'block_timestamp', NEW.block_timestamp
          )::text);
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      
      await this.notifyClient.query(`
        DROP TRIGGER IF EXISTS swap_insert_trigger ON swaps;
        CREATE TRIGGER swap_insert_trigger
        AFTER INSERT ON swaps
        FOR EACH ROW
        EXECUTE FUNCTION notify_swap_insert();
      `);
      
      await this.notifyClient.query('LISTEN new_swap');
      await this.notifyClient.query('LISTEN new_subscription');
      
      this.notifyClient.on('notification', (msg) => {
        if (msg.channel === 'new_swap') {
          this.notifyListeners(JSON.parse(msg.payload));
        } else if (msg.channel === 'new_subscription') {
          this.notifySubscriptionListeners(JSON.parse(msg.payload));
        }
      });
      
      console.log('Real-time notifications setup complete');
      return true;
    } catch (error) {
      console.error('Failed to setup real-time notifications:', error.message);
      return false;
    }
  }

  addRealtimeListener(callback) {
    this.listeners.add(callback);
  }

  removeRealtimeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(swapData) {
    this.listeners.forEach(callback => {
      try {
        callback(swapData);
      } catch (error) {
        console.error('Error in realtime listener:', error);
      }
    });
  }

  addSubscriptionListener(callback) {
    this.subscriptionListeners.add(callback);
  }

  removeSubscriptionListener(callback) {
    this.subscriptionListeners.delete(callback);
  }

  notifySubscriptionListeners(subscriptionData) {
    this.subscriptionListeners.forEach(callback => {
      try {
        callback(subscriptionData);
      } catch (error) {
        console.error('Error in subscription listener:', error);
      }
    });
  }

  async getLatestSwapLogs(limit = 10) {
    try {
      if (!this.client) {
        await this.connect();
      }

      const query = `SELECT 
        id,
        block_number,
        block_hash,
        transaction_hash,
        transaction_index,
        log_index,
        address,
        data,
        topics,
        block_timestamp
      FROM swaps 
      WHERE address = '0x337b56d87a6185cd46af3ac2cdf03cbc37070c30'
      ORDER BY block_timestamp DESC
      LIMIT $1`;

      const result = await this.client.query(query, [limit]);
      console.log(`Fetched ${result.rows.length} real swap logs from database`);
      return { data: result.rows, source: 'database' };
    } catch (error) {
      console.error('Database error:', error.message);
      throw error;
    }
  }

  async getSwapById(swapId) {
    try {
      if (!this.client) {
        await this.connect();
      }

      const query = `SELECT 
        id,
        block_number,
        block_hash,
        transaction_hash,
        transaction_index,
        log_index,
        address,
        data,
        topics,
        block_timestamp
      FROM swaps 
      WHERE id = $1`;

      const result = await this.client.query(query, [swapId]);
      if (result.rows.length > 0) {
        return { data: result.rows[0], source: 'database' };
      }
      return null;
    } catch (error) {
      console.error('Error fetching swap by ID:', error.message);
      return null;
    }
  }

  async query(text, params) {
    try {
      if (!this.client) {
        await this.connect();
      }
      return await this.client.query(text, params);
    } catch (error) {
      console.error('Database query error:', error.message);
      throw error;
    }
  }

}

module.exports = DatabaseService;