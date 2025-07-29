const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { log } = require('console');
const { usb } = require('usb');

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
   * Try to load USB libraries with fallback (Determines monitoring method)
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
   * Initialize USB monitoring (Called inside server initialize() method)
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
      currentDevices.forEach(async (device) => {
        const deviceId = this.generateDeviceIdFromUSB(device);
        if (!this.devices.has(deviceId)) {
          const deviceInfo = await this.enrichUSBDeviceInfo(device, 'connected');
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
          console.log('Parsing macOS USB output');
          return this.parseMacUSBOutput(output);
        case 'linux':
          console.log('Parsing Linux USB output');
          return this.parseLinuxUSBOutput(output);
        case 'win32':
          console.log('Parsing Windows USB output');
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
  generateDeviceIdFromUSB(device) {
    const desc = device.deviceDescriptor;
    return [
      desc.idVendor.toString(16).padStart(4, '0'),
      desc.idProduct.toString(16).padStart(4, '0'),
      device.busNumber,
      device.deviceAddress
    ].join('-');
  }

  // Try to get string descriptor from device
  async getStringDescriptor(device, index) {
    if (!index) return null;

    return new Promise((resolve) => {
      device.getStringDescriptor(index, (error, desc) => {
        if (error || !desc) {
          console.error(`Failed to get string descriptor ${index}:`, error);
          resolve(null);
        } else {
          resolve(desc);
        }
      });
    });
  }

  /**
   * Enrich USB device info from usb library
   */
  async enrichUSBDeviceInfo(usbDevice, status = 'connected') {
    const desc = usbDevice.deviceDescriptor;
    const now = new Date().toISOString();

    // Open device to read string descriptors
    try {
      usbDevice.open();

      const [manufacturer, product] = await Promise.all([
        this.getStringDescriptor(usbDevice, desc.iManufacturer),
        this.getStringDescriptor(usbDevice, desc.iProduct)
      ]);

      return {
        id: this.generateDeviceIdFromUSB(usbDevice),
        vendorId: desc.idVendor,
        productId: desc.idProduct,
        serialNumber: await this.getStringDescriptor(usbDevice, desc.iSerialNumber),
        manufacturer: manufacturer || 'Unknown Manufacturer',
        productName: product || this.getProductName(desc.idVendor, desc.idProduct),
        status: status,
        connectedAt: status === 'connected' ? now : null,
        disconnectedAt: status === 'disconnected' ? now : null,
        lastSeen: now,
        bcdDevice: desc.bcdDevice,
        bcdUSB: desc.bcdUSB
      };
    } catch (error) {
      console.error('Error processing USB device:', error);
      return {
        id: this.generateDeviceIdFromUSB(usbDevice),
        vendorId: desc.idVendor,
        productId: desc.idProduct,
        serialNumber: null,
        manufacturer: 'Unknown Manufacturer',
        productName: this.getProductName(desc.idVendor, desc.idProduct),
        status: 'error',
        error: error.message,
        lastSeen: now
      };
    } finally {
      if (usbDevice.interfaces) {
        usbDevice.close();
      }
    }
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
   * Refresh the current device list (First Run)
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
   * Refresh devices using native detection (First Run)
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
   * Refresh devices using USB library (First Run)
   */
  async refreshWithUSBLibrary() {
    if (!this.usbLib) return;

    const usbDevices = this.usbLib.getDeviceList();
    logger.info(usbDevices);
    logger.info(`Found ${usbDevices.length} USB devices using usb library`);
    usbDevices.forEach(async (usbDevice) => {
      const deviceInfo = await this.enrichUSBDeviceInfo(usbDevice, 'connected');
      this.devices.set(deviceInfo.id, deviceInfo);
    });
  }

  /**
   * Refresh devices using system commands (First Run)
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
      0x09da: 'A4TECH',
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

  getMountPoints() {
    try {
      if (process.platform === 'darwin') { // macOS
        const output = exec('df -h').toString();
        return output.split('\n')
          .filter(line => line.includes('/Volumes/'))
          .map(line => line.split(' ').pop());
      } else if (process.platform === 'win32') { // Windows
        const output = exec('wmic logicaldisk get name').toString();
        return output.split('\r\n')
          .filter(line => /^[A-Z]:/.test(line))
          .map(line => line.trim());
      } else { // Linux
        const output = exec('mount | grep /media/ || mount | grep /mnt/').toString();
        return output.split('\n')
          .filter(Boolean)
          .map(line => line.split(' ')[2]);
      }
    } catch (error) {
      console.error('Error detecting mounts:', error);
      return [];
    }
  }

  async getUSBStoragePath(deviceId) {
    const device = this.findDeviceById(deviceId);
    if (!device) throw new Error('Device not found');

    const vendorId = device.deviceDescriptor.idVendor;
    const productId = device.deviceDescriptor.idProduct;

    try {
      if (process.platform === 'win32') {
        console.log('Using Windows USB path detection');
        return this._getWindowsUSBPath(vendorId, productId);
      } else if (process.platform === 'darwin') {
        console.log('Using macOS USB path detection');
        return this._getMacUSBPath(vendorId, productId);
      } else {
        console.log('Using Linux USB path detection');
        return this._getLinuxUSBPath(vendorId, productId);
      }
    } catch (error) {
      throw new Error(`Could not locate USB storage: ${error.message}`);
    }
  }

  // Windows implementation
  _getWindowsUSBPath(vendorId, productId) {
    const drives = exec('wmic logicaldisk where "DriveType=2" get DeviceID').toString()
      .split('\r\n')
      .filter(line => /^[A-Z]:/.test(line))
      .map(line => line.trim());

    for (const drive of drives) {
      try {
        // Check if this is our device by querying USB info (Windows-specific)
        const driveInfo = exec(`wmic volume where "DriveLetter='${drive}'" get DeviceID`).toString();
        if (driveInfo.includes(`VID_${vendorId.toString(16).padStart(4, '0')}`) &&
          driveInfo.includes(`PID_${productId.toString(16).padStart(4, '0')}`)) {
          return drive + '\\';
        }
      } catch (e) {
        continue;
      }
    }
    throw new Error('Matching USB storage not found');
  }

  // macOS implementation
  _getMacUSBPath(vendorId, productId) {
    const volumes = exec('df -h | grep /Volumes/').toString()
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(' ').pop());

    for (const volume of volumes) {
      try {
        // Check if this is our device by checking disk info
        const diskInfo = exec(`diskutil info "${volume}"`).toString();
        if (diskInfo.includes(`Vendor ID:  0x${vendorId.toString(16).padStart(4, '0')}`) &&
          diskInfo.includes(`Product ID: 0x${productId.toString(16).padStart(4, '0')}`)) {
          return volume + '/';
        }
      } catch (e) {
        continue;
      }
    }
    throw new Error('Matching USB storage not found');
  }

  // Linux implementation
  _getLinuxUSBPath(vendorId, productId) {
    const mounts = exec('mount | grep /media/ || mount | grep /mnt/').toString()
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(' ')[2]);

    for (const mount of mounts) {
      try {
        // Check USB device info via symlinks
        const realPath = fs.realpathSync(mount);
        const deviceInfo = exec(`udevadm info -q property -n ${realPath}`).toString();
        if (deviceInfo.includes(`ID_VENDOR_ID=${vendorId.toString(16)}`) &&
          deviceInfo.includes(`ID_MODEL_ID=${productId.toString(16)}`)) {
          return mount + '/';
        }
      } catch (e) {
        continue;
      }
    }
    throw new Error('Matching USB storage not found');
  }

  // Get USB device tree from system_profiler
  async getUSBDeviceTree() {
    try {
      const output = await new Promise((resolve, reject) => {
        exec('system_profiler SPUSBDataType -json', (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else if (stderr) {
            reject(new Error(stderr));
          } else {
            resolve(stdout);
          }
        });
      });

      console.log('USB Device Tree:', output);
      return JSON.parse(output).SPUSBDataType;
    } catch (error) {
      throw new Error(`Failed to get USB device tree: ${error.message}`);
    }
  }

  // Find mount point for specific device
  async findMountPointForDevice(deviceId) {
    const device = this.findDeviceById(deviceId);
    if (!device) throw new Error('Device not found');

    const vendorId = device.deviceDescriptor.idVendor;
    const productId = device.deviceDescriptor.idProduct;
    const busNumber = device.busNumber;
    const deviceAddress = device.deviceAddress;

    const usbTree = await this.getUSBDeviceTree();

    // Search through USB tree for matching device
    for (const bus of usbTree) {
      if (!bus._items) continue;

      for (const usbDevice of bus._items) {
        // Match by vendor/product ID or bus/device position
        const matchesById = (
          parseInt(usbDevice.vendor_id?.split('x')[1], 16) === vendorId &&
          parseInt(usbDevice.product_id?.split('x')[1], 16) === productId
        );

        const matchesByLocation = (
          usbDevice.location_id?.includes(busNumber.toString()) &&
          usbDevice.location_id?.includes(deviceAddress.toString())
        );

        if (matchesById || matchesByLocation) {
          // Check for media with mount points
          if (usbDevice.Media) {
            for (const media of usbDevice.Media) {
              if (media.volumes) {
                for (const volume of media.volumes) {
                  if (volume.mount_point && volume.writable === 'yes') {
                    return volume.mount_point;
                  }
                }
              }
            }
          }
        }
      }
    }

    throw new Error('No writable mount point found for device');
  }

  // Main write method
  async writeFileToUSB(deviceId, filename, content) {
    try {
      const mountPoint = await this.findMountPointForDevice(deviceId);
      const filePath = path.join(mountPoint, filename);

      await fs.promises.writeFile(filePath, content, 'utf-8');

      return {
        success: true,
        path: filePath,
        deviceId: deviceId,
        bytesWritten: content.length
      };
    } catch (error) {
      console.error('Error writing to USB:', error);
      return {
        success: false,
        error: error.message,
        deviceId: deviceId
      };
    }
  }

  findDeviceById(deviceId) {
    // get the connected devices and check if the deviceId exists
    const devices = this.usbLib.getDeviceList();
    return devices.find(device => this.generateDeviceIdFromUSB(device) === deviceId);
  }
}

module.exports = RobustUSBManager;