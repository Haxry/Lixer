const DatabaseService = require('./databaseService');
const SwapEventDecoder = require('./swapDecoder');

class SwapDataService {
  constructor(databaseService = null) {
    this.dbService = databaseService || new DatabaseService();
    this.decoder = new SwapEventDecoder();
    this.recentSwaps = [];
    this.maxCacheSize = 20;
  }

  async getDecodedSwapData(limit = 10) {
    try {
      const result = await this.dbService.getLatestSwapLogs(limit);
      const rawLogs = result.data;
      const dataSource = result.source;
      
      const decodedSwaps = rawLogs.map(log => this.decoder.decodeSwapEvent(log));
      
      // Decoded swap data ready
      
      return {
        data: decodedSwaps,
        timestamp: new Date().toISOString(),
        count: decodedSwaps.length,
        source: dataSource
      };
    } catch (error) {
      console.error('Error getting decoded swap data:', error);
      return {
        data: [],
        timestamp: new Date().toISOString(),
        count: 0,
        source: 'error',
        error: error.message
      };
    }
  }

  async decodeNewSwap(swapId) {
    try {
      const result = await this.dbService.getSwapById(swapId);
      if (!result || !result.data) {
        throw new Error('Swap not found');
      }
      
      const decodedSwap = this.decoder.decodeSwapEvent(result.data);
      
      this.recentSwaps.unshift(decodedSwap);
      if (this.recentSwaps.length > this.maxCacheSize) {
        this.recentSwaps = this.recentSwaps.slice(0, this.maxCacheSize);
      }
      
      // New swap decoded
      
      return {
        newSwap: decodedSwap,
        recentSwaps: this.recentSwaps.slice(0, 10), // Return top 10
        timestamp: new Date().toISOString(),
        count: this.recentSwaps.length,
        source: 'realtime'
      };
    } catch (error) {
      console.error('Error decoding new swap:', error);
      return await this.getDecodedSwapData(10);
    }
  }

  async connect() {
    return await this.dbService.connect();
  }

  async disconnect() {
    return await this.dbService.disconnect();
  }
}

module.exports = SwapDataService;
