#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Install platform-specific dependencies
 */
function installPlatformDependencies() {
  const platform = process.platform;
  console.log(`\nInstalling platform-specific dependencies for ${platform}...`);

  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Platform-specific service management dependencies
  const platformDeps = {
    win32: ['node-windows@^1.0.0-beta.8'],
    linux: ['node-linux@^0.1.12'],
    darwin: ['node-mac@^1.0.1']
  };

  try {
    // Install platform-specific service management
    if (platformDeps[platform]) {
      console.log(`Installing ${platform} service management dependencies...`);
      const deps = platformDeps[platform];
      for (const dep of deps) {
        try {
          execSync(`npm install ${dep}`, { stdio: 'inherit' });
          console.log(`✓ Installed ${dep}`);
        } catch (error) {
          console.warn(`⚠ Failed to install ${dep}, service installation may not work`);
        }
      }
    }

    // Try to install USB monitoring dependencies
    console.log('Installing USB monitoring dependencies...');
    
    // Try node-usb-detection first (usually more reliable)
    try {
      execSync('npm install node-usb-detection@^0.6.0', { stdio: 'inherit' });
      console.log('✓ Installed node-usb-detection');
    } catch (error) {
      console.warn('⚠ Failed to install node-usb-detection, trying alternative methods...');
    }

    // Try usb library
    try {
      execSync('npm install usb@^2.16.0', { stdio: 'inherit' });
      console.log('✓ Installed usb library');
    } catch (error) {
      console.warn('⚠ Failed to install usb library, will use alternative detection methods');
    }

    console.log('\n✅ Platform dependency installation completed!');
    console.log('\nNote: If USB libraries failed to install, the service will use alternative detection methods.');
    
  } catch (error) {
    console.error('❌ Error installing platform dependencies:', error.message);
    console.log('\n📝 Manual installation options:');
    console.log('1. Try: npm install --build-from-source');
    console.log('2. Install build tools for your platform');
    console.log('3. Use the fallback USB detection methods');
  }
}

// Platform-specific build requirements info
function showBuildRequirements() {
  const platform = process.platform;
  
  console.log('\n📋 Build Requirements:');
  
  switch (platform) {
    case 'win32':
      console.log('Windows:');
      console.log('- Visual Studio Build Tools or Visual Studio Community');
      console.log('- Python 3.x');
      console.log('- Run: npm install --global windows-build-tools');
      break;
      
    case 'darwin':
      console.log('macOS:');
      console.log('- Xcode Command Line Tools: xcode-select --install');
      console.log('- Python 3.x');
      break;
      
    case 'linux':
      console.log('Linux:');
      console.log('- build-essential package');
      console.log('- Python 3.x');
      console.log('- libudev-dev (Ubuntu/Debian) or systemd-devel (RHEL/CentOS)');
      console.log('- Run: sudo apt-get install build-essential libudev-dev');
      break;
  }
}

if (require.main === module) {
  showBuildRequirements();
  installPlatformDependencies();
}

module.exports = installPlatformDependencies;