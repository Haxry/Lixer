require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const swapsRoutes = require('./routes/swaps');
const poolsRoutes = require('./routes/pools');
const statsRoutes = require('./routes/stats');
const timeseriesRoutes = require('./routes/timeseries');
const healthRoutes = require('./routes/health');
const websocketRoutes = require('./routes/websocket');
const SwapWebSocketServer = require('./services/wsServer');
const SubscriptionService = require('./services/subscriptionService');
const EmailService = require('./services/emailService');
const SwapDataService = require('./services/swapDataService');
const DatabaseService = require('./services/databaseService');

const databaseService = new DatabaseService();
const swapDataService = new SwapDataService(databaseService);
const subscriptionService = new SubscriptionService(databaseService);
const emailService = new EmailService();
const wsServer = new SwapWebSocketServer(swapDataService, databaseService, subscriptionService, emailService);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

app.use(cors());
app.use(express.json());

app.use('/swaps', swapsRoutes);
app.use('/pools', poolsRoutes);
app.use('/stats', statsRoutes);
app.use('/timeseries', timeseriesRoutes);
app.use('/health', healthRoutes);
app.use('/websocket', websocketRoutes);

// Initialize subscription routes
const { router: subscriptionRouter, initServices: initSubscriptionServices } = require('./routes/subscriptions');
initSubscriptionServices(subscriptionService, emailService);
app.use('/subscriptions', subscriptionRouter);

app.get('/', (req, res) => {
  // Determine WebSocket URL based on environment
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
  const host = req.get('host');
  const wsUrl = `${protocol}://${host}/ws`;

  res.json({
    message: 'Lixer API Server',
    version: '1.0.0',
    endpoints: {
      swaps: '/swaps',
      pools: '/pools',
      stats: '/stats',
      timeseries: '/timeseries',
      health: '/health',
      factories: '/factories',
      tokens: '/tokens',
      websocket: wsUrl
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

wsServer.start(server).then(() => {
  console.log(`WebSocket server integrated with HTTP server`);
}).catch(error => {
  console.error('Failed to start WebSocket server:', error);
});

// Setup subscription notifications listener
databaseService.addSubscriptionListener((subscriptionData) => {
  // Send welcome email for new subscriptions
  if (subscriptionData.action === 'created') {
    emailService.sendSubscriptionConfirmation(subscriptionData.email, subscriptionData.address)
      .catch(error => {
        console.error(`Failed to send welcome email to ${subscriptionData.email}:`, error.message);
      });
  }
});

// Initialize database tables
async function initServices() {
  try {
    await subscriptionService.createSubscriptionTable();
    console.log('Email subscriptions table initialized');
  } catch (error) {
    console.error('Failed to initialize subscription table:', error);
  }
}

initServices();

server.listen(PORT, () => {
  console.log(`Lixer API Server running on port ${PORT}`);
  console.log(`WebSocket server available at /ws`);
  console.log(`Subgraph URL: ${process.env.SUBGRAPH_URL}`);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down servers...');
  await wsServer.stop();
  server.close();
  process.exit(0);
});

module.exports = app;
