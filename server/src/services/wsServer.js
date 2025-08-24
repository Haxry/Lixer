const WebSocket = require('ws');
const SwapDataService = require('./swapDataService');

class SwapWebSocketServer {
  constructor(swapDataService, databaseService, subscriptionService = null, emailService = null) {
    this.wss = null;
    this.clients = new Set();
    this.swapDataService = swapDataService;
    this.databaseService = databaseService;
    this.subscriptionService = subscriptionService;
    this.emailService = emailService;
    this.broadcastInterval = null;
  }

  async start(server) {
    // If server is passed, attach to existing HTTP server, otherwise use port
    if (server) {
      this.wss = new WebSocket.Server({ server, path: '/ws' });
      console.log(`WebSocket server attached to HTTP server at /ws`);
    } else {
      const port = typeof server === 'number' ? server : 8080;
      this.wss = new WebSocket.Server({ port });
      console.log(`WebSocket server started on port ${port}`);
    }

    await this.setupRealtimeUpdates();

    this.wss.on('connection', (ws) => {
      console.log('New WebSocket client connected');
      this.clients.add(ws);
      
      this.sendDataToClient(ws);
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'get_latest') {
            this.sendDataToClient(ws);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }


  async sendDataToClient(ws) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        let swapData;
        if (this.swapDataService.recentSwaps && this.swapDataService.recentSwaps.length > 0) {
          swapData = {
            data: this.swapDataService.recentSwaps.slice(0, 10),
            timestamp: new Date().toISOString(),
            count: this.swapDataService.recentSwaps.length,
            source: 'cache'
          };
          console.log(`Sent cached data to new client - ${swapData.count} swaps`);
        } else {
          swapData = await this.swapDataService.getDecodedSwapData(10);
          console.log(`Sent initial data to new client - ${swapData.count} swaps`);
        }
        
        const message = {
          type: 'swap_data',
          timestamp: swapData.timestamp,
          count: swapData.count,
          source: swapData.source,
          data: swapData.data
        };
        
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending data to client:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to fetch swap data',
          timestamp: new Date().toISOString()
        }));
      }
    }
  }

  async broadcastRealtimeSwap(newSwapData) {
    try {
      const swapResult = await this.swapDataService.decodeNewSwap(newSwapData.id);
      const message = {
        type: 'realtime_swap',
        timestamp: new Date().toISOString(),
        count: swapResult.count,
        source: 'realtime',
        newSwap: swapResult.newSwap,
        data: swapResult.recentSwaps
      };
      
      // Broadcasting to WebSocket clients
      
      this.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
      
      await this.logTrackedSwaps(swapResult.newSwap);
    } catch (error) {
      console.error('Error broadcasting realtime data:', error);
    }
  }

  async logTrackedSwaps(swapData) {
    try {
      // Check email subscriptions
      const subscriptions = await this.subscriptionService.getSubscriptionsForSwap(
        swapData.sender, 
        swapData.recipient
      );

      for (const subscription of subscriptions) {
        try {
          if (this.emailService) {
            await this.emailService.sendSwapAlert(
              subscription.email, 
              swapData, 
              subscription.address
            );
            console.log(`📧 Swap alert sent to ${subscription.email}`);
          }
        } catch (emailError) {
          console.error(`Failed to send email to ${subscription.email}:`, emailError);
        }
      }
    } catch (error) {
      console.error('Error processing swap notifications:', error);
    }
  }

  async broadcastData() {
    try {
      const swapData = await this.swapDataService.getDecodedSwapData(10);
      const message = {
        type: 'swap_data_update',
        timestamp: swapData.timestamp,
        count: swapData.count,
        source: swapData.source,
        data: swapData.data
      };
      
      this.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
    } catch (error) {
      console.error('Error broadcasting data:', error);
    }
  }

  async setupRealtimeUpdates() {
    try {
      await this.databaseService.setupRealtimeNotifications();
      
      this.databaseService.addRealtimeListener((swapData) => {
        this.broadcastRealtimeSwap(swapData);
      });
      
      console.log('Real-time updates configured - no more polling!');
    } catch (error) {
      console.error('Failed to setup real-time updates:', error);

      this.startPollingFallback();
    }
  }

  startPollingFallback() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastData();
    }, 10000);
    
    console.log('Fallback: Started polling every 10 seconds');
  }

  async stop() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    
    if (this.wss) {
      this.wss.close();
    }
    
    await this.swapDataService.disconnect();
    
    console.log('WebSocket server stopped');
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }
}

module.exports = SwapWebSocketServer;
