const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

class RobustUSBManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.isMonitoring = false;
    this.connectionHistory = [];
    this.monitoringMethod = null;
    this.pollingInterval = null;
    this.lastDeviceList = [];

    // Try to load USB libraries
    this.usbLib = null;
    this.usbDetection = null;
    this.loadUSBLibraries();
  }

  /**
   * Try to load USB libraries with fallback
   */
  loadUSBLibraries() {
    try {
      this.usbDetection = require('node-usb-detection');
      this.monitoringMethod = 'node-usb-detection';
      logger.info('Using node-usb-detection for USB monitoring');
    } catch (error) {
      logger.warn('node-usb-detection not available:', error.message);
    }

    try {
      this.usbLib = require('usb');
      if (!this.monitoringMethod) {
        this.monitoringMethod = 'usb-polling';
        logger.info('Using usb library with polling for USB monitoring');
      }
    } catch (error) {
      logger.warn('usb library not available:', error.message);
    }

    if (!this.monitoringMethod) {
      this.monitoringMethod = 'system-polling';
      logger.info('Using system command polling for USB monitoring');
    }
  }

  /**
   * Initialize USB monitoring
   */
  async initialize() {
    try {
      logger.info(`Initializing USB Manager with method: ${this.monitoringMethod}`);

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
      switch (this.monitoringMethod) {
        case 'node-usb-detection':
          this.startNativeMonitoring();
          break;
        case 'usb-polling':
          this.startUSBPolling();
          break;
        case 'system-polling':
          this.startSystemPolling();
          break;
      }

      this.isMonitoring = true;
      logger.info(`USB monitoring started with method: ${this.monitoringMethod}`);
    } catch (error) {
      logger.error('Failed to start USB monitoring:', error);
      // Try fallback method
      this.startSystemPolling();
      this.isMonitoring = true;
    }
  }

  /**
   * Start native USB monitoring using node-usb-detection
   */
  startNativeMonitoring() {
    if (!this.usbDetection) {
      throw new Error('node-usb-detection not available');
    }

    this.usbDetection.on('add', (device) => {
      this.handleDeviceConnect(device);
    });

    this.usbDetection.on('remove', (device) => {
      this.handleDeviceDisconnect(device);
    });

    this.usbDetection.startMonitoring();
  }

  /**
   * Start USB monitoring using usb library with polling
   */
  startUSBPolling() {
    if (!this.usbLib) {
      throw new Error('usb library not available');
    }

    this.pollingInterval = setInterval(() => {
      this.pollUSBDevices();
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Start system-level USB monitoring using OS commands
   */
  startSystemPolling() {
    this.pollingInterval = setInterval(() => {
      this.pollSystemUSBDevices();
    }, 3000); // Poll every 3 seconds
  }

  /**
   * Poll USB devices using usb library
   */
  async pollUSBDevices() {
    try {
      const currentDevices = this.usbLib.getDeviceList();
      const currentDeviceIds = currentDevices.map(device =>
        this.generateDeviceIdFromUSB(device)
      );

      // Check for new devices
      currentDevices.forEach(device => {
        const deviceId = this.generateDeviceIdFromUSB(device);
        if (!this.devices.has(deviceId)) {
          const deviceInfo = this.enrichUSBDeviceInfo(device, 'connected');
          this.handleDeviceConnect(deviceInfo);
        }
      });

      // Check for removed devices
      this.devices.forEach((device, deviceId) => {
        if (!currentDeviceIds.includes(deviceId) && device.status === 'connected') {
          this.handleDeviceDisconnect(device);
        }
      });

    } catch (error) {
      logger.error('Error polling USB devices:', error);
    }
  }

  /**
   * Poll USB devices using system commands
   */
  async pollSystemUSBDevices() {
    try {
      const currentDevices = await this.getSystemUSBDevices();
      const currentDeviceIds = currentDevices.map(device => device.id);

      // Check for new devices
      currentDevices.forEach(device => {
        if (!this.devices.has(device.id)) {
          this.handleDeviceConnect(device);
        }
      });

      // Check for removed devices
      this.devices.forEach((device, deviceId) => {
        if (!currentDeviceIds.includes(deviceId) && device.status === 'connected') {
          this.handleDeviceDisconnect(device);
        }
      });

    } catch (error) {
      logger.error('Error polling system USB devices:', error);
    }
  }

  /**
   * Get USB devices using system commands
   */
  async getSystemUSBDevices() {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      let command;

      switch (platform) {
        case 'darwin':
          command = 'system_profiler SPUSBDataType -json';
          break;
        case 'linux':
          command = 'lsusb -v 2>/dev/null || lsusb';
          break;
        case 'win32':
          command = 'wmic path win32_usbhub get deviceid,description /format:csv';
          break;
        default:
          return resolve([]);
      }

      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.warn(`System USB command failed: ${error.message}`);
          return resolve([]);
        }

        try {
          const devices = this.parseSystemUSBOutput(stdout, platform);
          resolve(devices);
        } catch (parseError) {
          logger.error('Error parsing system USB output:', parseError);
          resolve([]);
        }
      });
    });
  }

  /**
   * Parse system USB command output
   */
  parseSystemUSBOutput(output, platform) {
    const devices = [];

    try {
      switch (platform) {
        case 'darwin':
          return this.parseMacUSBOutput(output);
        case 'linux':
          return this.parseLinuxUSBOutput(output);
        case 'win32':
          return this.parseWindowsUSBOutput(output);
        default:
          return [];
      }
    } catch (error) {
      logger.warn('Error parsing USB output:', error);
      return [];
    }
  }

  /**
   * Parse macOS system_profiler output
   */
  parseMacUSBOutput(output) {
    const devices = [];

    try {
      const data = JSON.parse(output);
      const usbData = data.SPUSBDataType || [];

      const extractDevices = (items, busNumber = 0) => {
        items.forEach((item, index) => {
          if (item._name && item._name !== 'USB Bus') {
            const device = {
              id: `mac-${busNumber}-${index}-${item.product_id || 'unknown'}`,
              vendorId: parseInt(item.vendor_id, 16) || 0,
              productId: parseInt(item.product_id, 16) || 0,
              serialNumber: item.serial_num || null,
              manufacturer: item.manufacturer || 'Unknown',
              productName: item._name,
              status: 'connected',
              connectedAt: new Date().toISOString(),
              lastSeen: new Date().toISOString()
            };
            devices.push(device);
          }

          if (item._items) {
            extractDevices(item._items, busNumber);
          }
        });
      };

      extractDevices(usbData);
    } catch (error) {
      logger.warn('Error parsing macOS USB data:', error);
    }

    return devices;
  }

  /**
   * Parse Linux lsusb output
   */
  parseLinuxUSBOutput(output) {
    const devices = [];
    const lines = output.split('\n');

    lines.forEach((line, index) => {
      const match = line.match(/Bus (\d+) Device (\d+): ID ([0-9a-f]{4}):([0-9a-f]{4})\s*(.+)/i);
      if (match) {
        const [, bus, deviceNum, vendorId, productId, description] = match;

        const device = {
          id: `linux-${bus}-${deviceNum}-${vendorId}-${productId}`,
          vendorId: parseInt(vendorId, 16),
          productId: parseInt(productId, 16),
          serialNumber: null,
          manufacturer: 'Unknown',
          productName: description.trim(),
          status: 'connected',
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        devices.push(device);
      }
    });

    return devices;
  }

  /**
   * Parse Windows wmic output
   */
  parseWindowsUSBOutput(output) {
    const devices = [];
    const lines = output.split('\n').slice(1); // Skip header

    lines.forEach((line, index) => {
      const parts = line.split(',');
      if (parts.length >= 2 && parts[1].trim()) {
        const device = {
          id: `windows-${index}-${Date.now()}`,
          vendorId: 0,
          productId: 0,
          serialNumber: null,
          manufacturer: 'Unknown',
          productName: parts[1].trim(),
          status: 'connected',
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        devices.push(device);
      }
    });

    return devices;
  }

  /**
   * Generate device ID from USB library device
   */
  generateDeviceIdFromUSB(usbDevice) {
    const desc = usbDevice.deviceDescriptor;
    return `${desc.idVendor}-${desc.idProduct}-${desc.iSerialNumber || 'no-serial'}`;
  }

  /**
   * Enrich USB device info from usb library
   */
  enrichUSBDeviceInfo(usbDevice, status = 'connected') {
    const desc = usbDevice.deviceDescriptor;
    logger.info(usbDevice);
    logger.info(desc);
    const now = new Date().toISOString();

    return {
      id: this.generateDeviceIdFromUSB(usbDevice),
      vendorId: desc.idVendor,
      productId: desc.idProduct,
      serialNumber: desc.iSerialNumber || null,
      manufacturer: 'Unknown Manufacturer',
      productName: this.getProductName(desc.idVendor, desc.idProduct),
      status: status,
      connectedAt: status === 'connected' ? now : null,
      disconnectedAt: status === 'disconnected' ? now : null,
      lastSeen: now
    };
  }

  /**
   * Handle device connection (unified method)
   */
  handleDeviceConnect(deviceInfo) {
    try {
      // Ensure proper device info structure
      if (typeof deviceInfo === 'object' && !deviceInfo.id) {
        deviceInfo = this.enrichDeviceInfo(deviceInfo, 'connected');
      }

      this.devices.set(deviceInfo.id, deviceInfo);
      this.addToHistory(deviceInfo, 'connect');

      logger.info(`USB device connected: ${deviceInfo.productName || 'Unknown'} (${deviceInfo.id})`);
      this.emit('deviceConnected', deviceInfo);
    } catch (error) {
      logger.error('Error handling device connection:', error);
    }
  }

  /**
   * Handle device disconnection (unified method)
   */
  handleDeviceDisconnect(deviceInfo) {
    try {
      let deviceId, existingDevice;

      if (typeof deviceInfo === 'string') {
        deviceId = deviceInfo;
        existingDevice = this.devices.get(deviceId);
      } else if (deviceInfo.id) {
        deviceId = deviceInfo.id;
        existingDevice = this.devices.get(deviceId) || deviceInfo;
      } else {
        deviceId = this.generateDeviceId(deviceInfo);
        existingDevice = this.devices.get(deviceId);
      }

      if (existingDevice) {
        existingDevice.status = 'disconnected';
        existingDevice.disconnectedAt = new Date().toISOString();

        this.addToHistory(existingDevice, 'disconnect');

        // Remove from active devices after delay
        setTimeout(() => {
          this.devices.delete(deviceId);
        }, 5000);

        logger.info(`USB device disconnected: ${existingDevice.productName || 'Unknown'} (${deviceId})`);
        this.emit('deviceDisconnected', existingDevice);
      }
    } catch (error) {
      logger.error('Error handling device disconnection:', error);
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
      if (this.usbDetection && this.monitoringMethod === 'node-usb-detection') {
        this.usbDetection.stopMonitoring();
      }

      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }

      this.isMonitoring = false;
      logger.info('USB monitoring stopped');
    } catch (error) {
      logger.error('Error stopping USB monitoring:', error);
    }
  }

  /**
   * Refresh the current device list
   */
  async refreshDeviceList() {
    try {
      this.devices.clear();

      switch (this.monitoringMethod) {
        case 'node-usb-detection':
          await this.refreshWithNativeDetection();
          break;
        case 'usb-polling':
          await this.refreshWithUSBLibrary();
          break;
        case 'system-polling':
          await this.refreshWithSystemCommands();
          break;
      }

      logger.info(`Refreshed device list: ${this.devices.size} devices found`);
    } catch (error) {
      logger.error('Error refreshing device list:', error);
      throw error;
    }
  }

  /**
   * Refresh devices using native detection
   */
  async refreshWithNativeDetection() {
    if (!this.usbDetection) return;

    return new Promise((resolve, reject) => {
      this.usbDetection.find((err, devices) => {
        if (err) {
          reject(err);
        } else {
          devices.forEach(device => {
            const deviceInfo = this.enrichDeviceInfo(device, 'connected');
            this.devices.set(deviceInfo.id, deviceInfo);
          });
          resolve();
        }
      });
    });
  }

  /**
   * Refresh devices using USB library
   */
  async refreshWithUSBLibrary() {
    if (!this.usbLib) return;

    const usbDevices = this.usbLib.getDeviceList();
    usbDevices.forEach(usbDevice => {
      const deviceInfo = this.enrichUSBDeviceInfo(usbDevice, 'connected');
      this.devices.set(deviceInfo.id, deviceInfo);
    });
  }

  /**
   * Refresh devices using system commands
   */
  async refreshWithSystemCommands() {
    const systemDevices = await this.getSystemUSBDevices();
    systemDevices.forEach(device => {
      this.devices.set(device.id, device);
    });
  }

  /**
   * Enrich device information (fallback method)
   */
  enrichDeviceInfo(device, status = 'unknown') {
    const now = new Date().toISOString();
    const deviceId = this.generateDeviceId(device);

    return {
      id: deviceId,
      vendorId: device.vendorId || 0,
      productId: device.productId || 0,
      serialNumber: device.serialNumber || null,
      manufacturer: device.manufacturer || 'Unknown Manufacturer',
      productName: device.productName || this.getProductName(device.vendorId, device.productId),
      locationId: device.locationId || null,
      deviceName: device.deviceName || null,
      status: status,
      connectedAt: status === 'connected' ? now : null,
      disconnectedAt: status === 'disconnected' ? now : null,
      lastSeen: now
    };
  }

  /**
   * Generate unique device ID (fallback method)
   */
  generateDeviceId(device) {
    return `${device.vendorId || 0}-${device.productId || 0}-${device.serialNumber || 'no-serial'}`;
  }

  /**
   * Get product name from vendor/product IDs
   */
  getProductName(vendorId, productId) {
    const vendors = {
      0x1234: 'Example Vendor',
      0x04d8: 'Microchip Technology Inc.',
      0x046d: 'Logitech',
      0x413c: 'Dell Computer Corp.',
      0x05ac: 'Apple Inc.',
      0x045e: 'Microsoft Corp.',
      0x8087: 'Intel Corp.',
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
      monitoringMethod: this.monitoringMethod,
      deviceCount: this.devices.size,
      historyCount: this.connectionHistory.length,
      uptime: process.uptime(),
      librariesAvailable: {
        'node-usb-detection': !!this.usbDetection,
        'usb': !!this.usbLib
      }
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

module.exports = RobustUSBManager;