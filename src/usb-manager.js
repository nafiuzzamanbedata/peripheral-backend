const usb = require('usb');
const usbDetection = require('node-usb-detection');
const EventEmitter = require('events');
const logger = require('./utils/logger');

class USBManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.isMonitoring = false;
    this.connectionHistory = [];
  }

  /**
   * Initialize USB monitoring
   */
  async initialize() {
    try {
      logger.info('Initializing USB Manager...');
      
      // Get initial device list
      await this.refreshDeviceList();
      
      // Start monitoring for device changes
      this.startMonitoring();
      
      logger.info(`USB Manager initialized with ${this.devices.size} devices`);
      return true;
    } catch (error) {
      logger.error('Failed to initialize USB Manager:', error);
      throw error;
    }
  }

  /**
   * Start monitoring USB device changes
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('USB monitoring is already active');
      return;
    }

    try {
      // Monitor device connections
      usbDetection.on('add', (device) => {
        this.handleDeviceConnect(device);
      });

      // Monitor device disconnections
      usbDetection.on('remove', (device) => {
        this.handleDeviceDisconnect(device);
      });

      // Start monitoring
      usbDetection.startMonitoring();
      this.isMonitoring = true;
      
      logger.info('USB monitoring started successfully');
    } catch (error) {
      logger.error('Failed to start USB monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring USB device changes
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    try {
      usbDetection.stopMonitoring();
      this.isMonitoring = false;
      logger.info('USB monitoring stopped');
    } catch (error) {
      logger.error('Error stopping USB monitoring:', error);
    }
  }

  /**
   * Handle device connection
   */
  handleDeviceConnect(device) {
    try {
      const deviceInfo = this.enrichDeviceInfo(device, 'connected');
      this.devices.set(deviceInfo.id, deviceInfo);
      
      // Add to history
      this.addToHistory(deviceInfo, 'connect');
      
      logger.info(`USB device connected: ${deviceInfo.productName || 'Unknown'} (${deviceInfo.id})`);
      
      // Emit event for real-time updates
      this.emit('deviceConnected', deviceInfo);
    } catch (error) {
      logger.error('Error handling device connection:', error);
    }
  }

  /**
   * Handle device disconnection
   */
  handleDeviceDisconnect(device) {
    try {
      const deviceId = this.generateDeviceId(device);
      const existingDevice = this.devices.get(deviceId);
      
      if (existingDevice) {
        existingDevice.status = 'disconnected';
        existingDevice.disconnectedAt = new Date().toISOString();
        
        // Add to history
        this.addToHistory(existingDevice, 'disconnect');
        
        // Remove from active devices after a delay to show in UI
        setTimeout(() => {
          this.devices.delete(deviceId);
        }, 5000);
        
        logger.info(`USB device disconnected: ${existingDevice.productName || 'Unknown'} (${deviceId})`);
        
        // Emit event for real-time updates
        this.emit('deviceDisconnected', existingDevice);
      }
    } catch (error) {
      logger.error('Error handling device disconnection:', error);
    }
  }

  /**
   * Refresh the current device list
   */
  async refreshDeviceList() {
    try {
      // Clear current devices
      this.devices.clear();
      
      // Get devices using node-usb-detection
      const detectedDevices = await new Promise((resolve, reject) => {
        usbDetection.find((err, devices) => {
          if (err) reject(err);
          else resolve(devices);
        });
      });

      // Also get devices using usb library for additional info
      const usbDevices = usb.getDeviceList();
      
      // Process detected devices
      detectedDevices.forEach(device => {
        const deviceInfo = this.enrichDeviceInfo(device, 'connected');
        this.devices.set(deviceInfo.id, deviceInfo);
      });

      // Add any additional devices from usb library
      usbDevices.forEach(usbDevice => {
        const device = {
          vendorId: usbDevice.deviceDescriptor.idVendor,
          productId: usbDevice.deviceDescriptor.idProduct,
          serialNumber: usbDevice.deviceDescriptor.iSerialNumber
        };
        
        const deviceId = this.generateDeviceId(device);
        if (!this.devices.has(deviceId)) {
          const deviceInfo = this.enrichDeviceInfo(device, 'connected');
          this.devices.set(deviceInfo.id, deviceInfo);
        }
      });

      logger.info(`Refreshed device list: ${this.devices.size} devices found`);
    } catch (error) {
      logger.error('Error refreshing device list:', error);
      throw error;
    }
  }

  /**
   * Enrich device information
   */
  enrichDeviceInfo(device, status = 'unknown') {
    const now = new Date().toISOString();
    const deviceId = this.generateDeviceId(device);
    
    return {
      id: deviceId,
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber || null,
      manufacturer: device.manufacturer || 'Unknown Manufacturer',
      productName: device.productName || this.getProductName(device.vendorId, device.productId),
      locationId: device.locationId || null,
      deviceName: device.deviceName || null,
      deviceAddress: device.deviceAddress || null,
      status: status,
      connectedAt: status === 'connected' ? now : null,
      disconnectedAt: status === 'disconnected' ? now : null,
      lastSeen: now
    };
  }

  /**
   * Generate unique device ID
   */
  generateDeviceId(device) {
    return `${device.vendorId}-${device.productId}-${device.serialNumber || 'no-serial'}`;
  }

  /**
   * Get product name from vendor/product IDs
   */
  getProductName(vendorId, productId) {
    // Basic USB vendor/product lookup
    const vendors = {
      0x1234: 'Example Vendor',
      0x04d8: 'Microchip Technology Inc.',
      0x046d: 'Logitech',
      0x413c: 'Dell Computer Corp.',
      // Add more vendors as needed
    };
    
    const vendor = vendors[vendorId] || `Vendor 0x${vendorId?.toString(16).padStart(4, '0')}`;
    return `${vendor} Device 0x${productId?.toString(16).padStart(4, '0')}`;
  }

  /**
   * Add event to history
   */
  addToHistory(device, eventType) {
    const historyEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deviceId: device.id,
      device: { ...device },
      eventType: eventType,
      timestamp: new Date().toISOString()
    };
    
    this.connectionHistory.unshift(historyEntry);
    
    // Keep only last 1000 entries
    if (this.connectionHistory.length > 1000) {
      this.connectionHistory = this.connectionHistory.slice(0, 1000);
    }
  }

  /**
   * Get current devices
   */
  getDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Get connection history
   */
  getHistory(limit = 50) {
    return this.connectionHistory.slice(0, limit);
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      deviceCount: this.devices.size,
      historyCount: this.connectionHistory.length,
      uptime: process.uptime()
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    logger.info('Cleaning up USB Manager...');
    this.stopMonitoring();
    this.devices.clear();
    this.removeAllListeners();
  }
}

module.exports = USBManager;