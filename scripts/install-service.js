#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const SERVICE_NAME = process.env.SERVICE_NAME || 'USBMonitorService';
const SERVICE_DESCRIPTION = process.env.SERVICE_DESCRIPTION || 'USB Device Monitoring Service';
const SERVICE_SCRIPT = path.join(__dirname, '../src/server.js');

/**
 * Install service based on platform
 */
async function installService() {
  const platform = process.platform;
  
  console.log(`Installing USB Monitor Service on ${platform}...`);
  
  try {
    switch (platform) {
      case 'win32':
        await installWindowsService();
        break;
      case 'linux':
        await installLinuxService();
        break;
      case 'darwin':
        await installMacService();
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    console.log('Service installed successfully!');
    console.log(`Service name: ${SERVICE_NAME}`);
    console.log('To start the service:');
    
    switch (platform) {
      case 'win32':
        console.log(`  net start ${SERVICE_NAME}`);
        break;
      case 'linux':
        console.log(`  sudo systemctl start ${SERVICE_NAME.toLowerCase()}`);
        console.log(`  sudo systemctl enable ${SERVICE_NAME.toLowerCase()}`);
        break;
      case 'darwin':
        console.log(`  sudo launchctl load /Library/LaunchDaemons/com.usbmonitor.${SERVICE_NAME.toLowerCase()}.plist`);
        break;
    }
  } catch (error) {
    console.error('Failed to install service:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure you have the required platform dependencies installed');
    console.log('2. Run: npm run install-platform-deps');
    console.log('3. The service will still work without native USB libraries using system polling');
    process.exit(1);
  }
}

/**
 * Install Windows service
 */
async function installWindowsService() {
  try {
    const Service = require('node-windows').Service;
    
    // Create a new service object
    const svc = new Service({
      name: SERVICE_NAME,
      description: SERVICE_DESCRIPTION,
      script: SERVICE_SCRIPT,
      nodeOptions: [
        '--max_old_space_size=4096'
      ],
      env: [
        {
          name: "NODE_ENV",
          value: "production"
        },
        {
          name: "PORT",
          value: process.env.PORT || "3001"
        }
      ]
    });

    // Listen for the "install" event
    svc.on('install', () => {
      console.log('Windows service installed successfully');
      svc.start();
    });

    // Listen for the "alreadyinstalled" event
    svc.on('alreadyinstalled', () => {
      console.log('Service is already installed');
    });

    // Install the service
    svc.install();
  } catch (error) {
    console.error('node-windows not available. Installing service manually...');
    console.log('Please install node-windows: npm install node-windows');
    throw error;
  }
}

/**
 * Install Linux systemd service
 */
async function installLinuxService() {
  const serviceName = SERVICE_NAME.toLowerCase();
  const serviceFile = `/etc/systemd/system/${serviceName}.service`;
  const nodeExecutable = process.execPath;
  const workingDir = path.dirname(SERVICE_SCRIPT);
  
  const serviceConfig = `[Unit]
Description=${SERVICE_DESCRIPTION}
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=root
WorkingDirectory=${workingDir}
ExecStart=${nodeExecutable} ${SERVICE_SCRIPT}
Environment=NODE_ENV=production
Environment=PORT=${process.env.PORT || '3001'}

[Install]
WantedBy=multi-user.target
`;

  // Write service file
  fs.writeFileSync(serviceFile, serviceConfig);
  console.log(`Created service file: ${serviceFile}`);
  
  // Reload systemd
  const { execSync } = require('child_process');
  execSync('systemctl daemon-reload');
  console.log('Systemd daemon reloaded');
}

/**
 * Install macOS LaunchDaemon
 */
async function installMacService() {
  const serviceName = SERVICE_NAME.toLowerCase();
  const plistFile = `/Library/LaunchDaemons/com.usbmonitor.${serviceName}.plist`;
  const nodeExecutable = process.execPath;
  const workingDir = path.dirname(SERVICE_SCRIPT);
  
  const plistConfig = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.usbmonitor.${serviceName}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodeExecutable}</string>
        <string>${SERVICE_SCRIPT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workingDir}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/${serviceName}.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/${serviceName}.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>${process.env.PORT || '3001'}</string>
    </dict>
</dict>
</plist>
`;

  // Write plist file
  fs.writeFileSync(plistFile, plistConfig);
  console.log(`Created plist file: ${plistFile}`);
  
  // Set proper permissions
  const { execSync } = require('child_process');
  execSync(`chown root:wheel ${plistFile}`);
  execSync(`chmod 644 ${plistFile}`);
  console.log('Set proper permissions for plist file');
}

/**
 * Check if running as administrator/root
 */
function checkPermissions() {
  if (process.platform === 'win32') {
    // On Windows, we'll try to install and let node-windows handle permissions
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
  
  installService();
}

module.exports = installService;