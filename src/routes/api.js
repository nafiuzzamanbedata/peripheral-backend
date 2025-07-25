const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Initialize API routes with USB manager instance
 */
function initializeRoutes(usbManager) {
  
  // Get all connected USB devices
  router.get('/devices', (req, res) => {
    try {
      const devices = usbManager.getDevices();
      res.json({
        success: true,
        data: devices,
        count: devices.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting devices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve devices',
        message: error.message
      });
    }
  });

  // Get specific device by ID
  router.get('/devices/:id', (req, res) => {
    try {
      const device = usbManager.getDevice(req.params.id);
      
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found',
          message: `No device found with ID: ${req.params.id}`
        });
      }

      res.json({
        success: true,
        data: device,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting device:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve device',
        message: error.message
      });
    }
  });

  // Get connection history
  router.get('/history', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const history = usbManager.getHistory(limit);
      
      res.json({
        success: true,
        data: history,
        count: history.length,
        limit: limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve history',
        message: error.message
      });
    }
  });

  // Get service status
  router.get('/status', (req, res) => {
    try {
      const status = usbManager.getStatus();
      
      res.json({
        success: true,
        data: {
          ...status,
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      });
    } catch (error) {
      logger.error('Error getting status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve status',
        message: error.message
      });
    }
  });

  // Refresh device list
  router.post('/devices/refresh', async (req, res) => {
    try {
      await usbManager.refreshDeviceList();
      const devices = usbManager.getDevices();
      
      res.json({
        success: true,
        message: 'Device list refreshed successfully',
        data: devices,
        count: devices.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error refreshing devices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh devices',
        message: error.message
      });
    }
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Get device statistics
  router.get('/stats', (req, res) => {
    try {
      const devices = usbManager.getDevices();
      const history = usbManager.getHistory(1000);
      
      // Calculate statistics
      const connectedCount = devices.filter(d => d.status === 'connected').length;
      const disconnectedCount = devices.filter(d => d.status === 'disconnected').length;
      
      const connectEvents = history.filter(h => h.eventType === 'connect').length;
      const disconnectEvents = history.filter(h => h.eventType === 'disconnect').length;
      
      // Group by manufacturer
      const manufacturerStats = devices.reduce((acc, device) => {
        const manufacturer = device.manufacturer || 'Unknown';
        acc[manufacturer] = (acc[manufacturer] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          devices: {
            total: devices.length,
            connected: connectedCount,
            disconnected: disconnectedCount
          },
          events: {
            total: history.length,
            connects: connectEvents,
            disconnects: disconnectEvents
          },
          manufacturers: manufacturerStats,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = initializeRoutes;