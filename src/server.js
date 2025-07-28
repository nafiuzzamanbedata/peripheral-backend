require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const USBManager = require('./usb-manager-robust');
const SocketHandler = require('./socket/socketHandler');
const apiRoutes = require('./routes/api');
const logger = require('./utils/logger');

class USBMonitorService {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.usbManager = new USBManager();
    this.socketHandler = null;
    this.port = process.env.PORT || 3001;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  /**
   * Setup Express middleware to log incoming requests, handle CORS, and parse JSON bodies
   */
  setupMiddleware() {
    // Security headers
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url} - ${req.ip}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint (before API routes)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api', apiRoutes(this.usbManager));

    // Serve static files for documentation or simple web interface
    this.app.use('/docs', express.static(path.join(__dirname, '../docs')));

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'USB Monitor Service',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          api: '/api',
          docs: '/docs',
          websocket: 'ws://localhost:' + this.port
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup error handlers
   */
  setupErrorHandlers() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);

      res.status(err.status || 500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      logger.info('Starting USB Monitor Service...');

      // Initialize USB Manager
      await this.usbManager.initialize();

      // Initialize Socket Handler
      this.socketHandler = new SocketHandler(this.io, this.usbManager);

      // Start periodic status updates
      this.socketHandler.startStatusUpdates(30000); // Every 30 seconds

      logger.info('USB Monitor Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize USB Monitor Service:', error);
      throw error;
    }
  }

  /**
   * Start the server
   */
  async start() {
    try {
      await this.initialize();

      this.server.listen(this.port, '0.0.0.0', () => {
        logger.info(`USB Monitor Service listening on port ${this.port}`);
        logger.info(`API endpoints available at http://localhost:${this.port}/api`);
        logger.info(`WebSocket available at ws://localhost:${this.port}`);
        logger.info(`Health check at http://localhost:${this.port}/health`);
      });

      // Handle server shutdown gracefully
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start USB Monitor Service:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // Close server
        this.server.close(() => {
          logger.info('HTTP server closed');
        });

        // Cleanup USB Manager
        if (this.usbManager) {
          this.usbManager.cleanup();
        }

        // Close socket connections
        if (this.io) {
          this.io.close(() => {
            logger.info('Socket.io server closed');
          });
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle various termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      server: {
        port: this.port,
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform
      },
      usb: this.usbManager ? this.usbManager.getStatus() : null,
      sockets: this.socketHandler ? this.socketHandler.getSocketStats() : null
    };
  }
}

// Create and start the service if this file is run directly
if (require.main === module) {
  const service = new USBMonitorService();

  // Start the service
  service.start().catch((error) => {
    logger.error('Failed to start service:', error);
    process.exit(1);
  });
}

module.exports = USBMonitorService;