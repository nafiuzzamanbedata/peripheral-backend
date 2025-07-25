const logger = require('../utils/logger');

class SocketHandler {
  constructor(io, usbManager) {
    this.io = io;
    this.usbManager = usbManager;
    this.connectedClients = new Set();
    
    this.setupEventHandlers();
    this.setupSocketConnections();
  }

  /**
   * Setup USB event handlers
   */
  setupEventHandlers() {
    // Handle device connections
    this.usbManager.on('deviceConnected', (device) => {
      logger.info(`Broadcasting device connected: ${device.id}`);
      this.io.emit('device:connected', {
        type: 'device:connected',
        device: device,
        timestamp: new Date().toISOString()
      });
    });

    // Handle device disconnections
    this.usbManager.on('deviceDisconnected', (device) => {
      logger.info(`Broadcasting device disconnected: ${device.id}`);
      this.io.emit('device:disconnected', {
        type: 'device:disconnected',
        device: device,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup socket connection handlers
   */
  setupSocketConnections() {
    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      this.connectedClients.add(clientId);
      
      logger.info(`Client connected: ${clientId} (Total: ${this.connectedClients.size})`);

      // Send initial data to newly connected client
      this.sendInitialData(socket);

      // Handle client requests
      this.setupClientHandlers(socket);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.connectedClients.delete(clientId);
        logger.info(`Client disconnected: ${clientId}, Reason: ${reason} (Total: ${this.connectedClients.size})`);
      });
    });
  }

  /**
   * Send initial data to newly connected client
   */
  async sendInitialData(socket) {
    try {
      // Send current devices
      const devices = this.usbManager.getDevices();
      socket.emit('devices:initial', {
        type: 'devices:initial',
        devices: devices,
        timestamp: new Date().toISOString()
      });

      // Send recent history
      const history = this.usbManager.getHistory(20);
      socket.emit('history:initial', {
        type: 'history:initial',
        history: history,
        timestamp: new Date().toISOString()
      });

      // Send status
      const status = this.usbManager.getStatus();
      socket.emit('status:initial', {
        type: 'status:initial',
        status: status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error sending initial data:', error);
      socket.emit('error', {
        type: 'error',
        message: 'Failed to send initial data',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Setup client event handlers
   */
  setupClientHandlers(socket) {
    // Handle device list request
    socket.on('devices:get', async () => {
      try {
        const devices = this.usbManager.getDevices();
        socket.emit('devices:list', {
          type: 'devices:list',
          devices: devices,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error handling devices:get:', error);
        socket.emit('error', {
          type: 'error',
          message: 'Failed to get devices',
          error: error.message
        });
      }
    });

    // Handle device refresh request
    socket.on('devices:refresh', async () => {
      try {
        await this.usbManager.refreshDeviceList();
        const devices = this.usbManager.getDevices();
        
        // Broadcast to all clients
        this.io.emit('devices:refreshed', {
          type: 'devices:refreshed',
          devices: devices,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        logger.error('Error handling devices:refresh:', error);
        socket.emit('error', {
          type: 'error',
          message: 'Failed to refresh devices',
          error: error.message
        });
      }
    });

    // Handle history request
    socket.on('history:get', (data) => {
      try {
        const limit = data?.limit || 50;
        const history = this.usbManager.getHistory(limit);
        
        socket.emit('history:list', {
          type: 'history:list',
          history: history,
          limit: limit,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error handling history:get:', error);
        socket.emit('error', {
          type: 'error',
          message: 'Failed to get history',
          error: error.message
        });
      }
    });

    // Handle status request
    socket.on('status:get', () => {
      try {
        const status = this.usbManager.getStatus();
        socket.emit('status:update', {
          type: 'status:update',
          status: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error handling status:get:', error);
        socket.emit('error', {
          type: 'error',
          message: 'Failed to get status',
          error: error.message
        });
      }
    });

    // Handle ping for connection testing
    socket.on('ping', (data) => {
      socket.emit('pong', {
        type: 'pong',
        timestamp: new Date().toISOString(),
        data: data
      });
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(event, data) {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send periodic status updates
   */
  startStatusUpdates(interval = 30000) {
    setInterval(() => {
      try {
        const status = this.usbManager.getStatus();
        this.broadcast('status:periodic', {
          type: 'status:periodic',
          status: status
        });
      } catch (error) {
        logger.error('Error sending periodic status update:', error);
      }
    }, interval);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  /**
   * Get socket statistics
   */
  getSocketStats() {
    return {
      connectedClients: this.connectedClients.size,
      totalConnections: this.io.engine.clientsCount
    };
  }
}

module.exports = SocketHandler;