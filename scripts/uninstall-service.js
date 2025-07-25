#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const SERVICE_NAME = process.env.SERVICE_NAME || 'USBMonitorService';

/**
 * Uninstall service based on platform
 */
async function uninstallService() {
  const platform = process.platform;
  
  console.log(`Uninstalling USB Monitor Service from ${platform}...`);
  
  try {
    switch (platform) {
      case 'win32':
        await uninstallWindowsService();
        break;
      case 'linux':
        await uninstallLinuxService();
        break;
      case 'darwin':
        await uninstallMacService();
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    console.log('Service uninstalled successfully!');
    
  } catch (error) {
    console.error('Failed to uninstall service:', error.message);
    process.exit(1);
  }
}

/**
 * Uninstall Windows service
 */
async function uninstallWindowsService() {
  const Service = require('node-windows').Service;
  const SERVICE_SCRIPT = path.join(__dirname, '../src/server.js');
  
  // Create a new service object
  const svc = new Service({
    name: SERVICE_NAME,
    script: SERVICE_SCRIPT
  });

  // Listen for the "uninstall" event
  svc.on('uninstall', () => {
    console.log('Windows service uninstalled successfully');
  });

  // Listen for the "notinstalled" event
  svc.on('notinstalled', () => {
    console.log('Service is not installed');
  });

  // Uninstall the service
  svc.uninstall();
}

/**
 * Uninstall Linux systemd service
 */
async function uninstallLinuxService() {
  const serviceName = SERVICE_NAME.toLowerCase();
  const serviceFile = `/etc/systemd/system/${serviceName}.service`;
  const { execSync } = require('child_process');
  
  try {
    // Stop the service if running
    try {
      execSync(`systemctl stop ${serviceName}`);
      console.log('Service stopped');
    } catch (error) {
      console.log('Service was not running');
    }
    
    // Disable the service
    try {
      execSync(`systemctl disable ${serviceName}`);
      console.log('Service disabled');
    } catch (error) {
      console.log('Service was not enabled');
    }
    
    // Remove service file
    if (fs.existsSync(serviceFile)) {
      fs.unlinkSync(serviceFile);
      console.log(`Removed service file: ${serviceFile}`);
    } else {
      console.log('Service file does not exist');
    }
    
    // Reload systemd
    execSync('systemctl daemon-reload');
    console.log('Systemd daemon reloaded');
    
  } catch (error) {
    throw new Error(`Failed to uninstall Linux service: ${error.message}`);
  }
}

/**
 * Uninstall macOS LaunchDaemon
 */
async function uninstallMacService() {
  const serviceName = SERVICE_NAME.toLowerCase();
  const plistFile = `/Library/LaunchDaemons/com.usbmonitor.${serviceName}.plist`;
  const { execSync } = require('child_process');
  
  try {
    // Unload the service if loaded
    try {
      execSync(`launchctl unload ${plistFile}`);
      console.log('Service unloaded');
    } catch (error) {
      console.log('Service was not loaded');
    }
    
    // Remove plist file
    if (fs.existsSync(plistFile)) {
      fs.unlinkSync(plistFile);
      console.log(`Removed plist file: ${plistFile}`);
    } else {
      console.log('Plist file does not exist');
    }
    
  } catch (error) {
    throw new Error(`Failed to uninstall macOS service: ${error.message}`);
  }
}

/**
 * Check if running as administrator/root
 */
function checkPermissions() {
  if (process.platform === 'win32') {
    // On Windows, we'll try to uninstall and let node-windows handle permissions
    return true;
  } else {
    // On Unix-like systems, check for root
    if (process.getuid && process.getuid() !== 0) {
      console.error('This script must be run as root (use sudo)');
      return false;
    }
  }
  return true;
}

// Main execution
if (require.main === module) {
  if (!checkPermissions()) {
    process.exit(1);
  }
  
  uninstallService();
}

module.exports = uninstallService;