# USB Monitor Service - Installation Guide

This guide will help you install and run the USB Monitor Service on macOS, dealing with common dependency issues.

## Quick Start (Recommended)

### Step 1: Install Core Dependencies
```bash
npm install
```

### Step 2: Install Platform-Specific Dependencies
```bash
npm run install-platform-deps
```

### Step 3: Start the Service
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## Dealing with Native Library Issues

If you encounter errors with `node-usb-detection` or `usb` libraries (which is common), don't worry! The service has multiple fallback methods:

### Fallback Detection Methods:
1. **Native Libraries** (Best performance) - `node-usb-detection` + `usb`
2. **USB Library Only** - Uses `usb` library with polling
3. **System Commands** (Most compatible) - Uses OS commands like `lsusb`, `system_profiler`

## Platform-Specific Setup

### macOS (Your Current Platform)

#### Prerequisites:
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Installation Steps:
```bash
# 1. Clone/download the project
cd your-project-directory

# 2. Install basic dependencies (this should work)
npm install

# 3. Try to install USB libraries (optional - service works without them)
npm install usb node-usb-detection --save-optional

# 4. If USB libraries fail, that's OK! Start the service anyway:
npm run dev
```

#### If USB Libraries Fail to Install:
The service will automatically use system commands (`system_profiler`) to detect USB devices. This works reliably on macOS.

### Linux

#### Prerequisites:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install build-essential libudev-dev python3

# RHEL/CentOS/Fedora
sudo yum install gcc-c++ make libudev-devel python3
# or
sudo dnf install gcc-c++ make systemd-devel python3
```

#### Installation:
```bash
npm install
npm run install-platform-deps
```

### Windows

#### Prerequisites:
```bash
# Install build tools
npm install -g windows-build-tools

# Or install Visual Studio Build Tools manually
```

#### Installation:
```bash
npm install
npm run install-platform-deps
```

## Testing the Installation

### 1. Check Service Status:
```bash
curl http://localhost:3001/health
```

### 2. Test USB Detection:
```bash
curl http://localhost:3001/api/devices
```

### 3. Test WebSocket:
Open your browser's developer console and run:
```javascript
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('Connected!'));
socket.on('device:connected', (data) => console.log('Device connected:', data));
```

## Service Installation (Optional)

### macOS Service:
```bash
# Install as LaunchDaemon
sudo npm run install-service

# Start service
sudo launchctl load /Library/LaunchDaemons/com.usbmonitor.usbmonitorservice.plist

# Check status
sudo launchctl list | grep usbmonitor
```

### Linux Service:
```bash
# Install as systemd service
sudo npm run install-service

# Start and enable service
sudo systemctl start usbmonitorservice
sudo systemctl enable usbmonitorservice

# Check status
sudo systemctl status usbmonitorservice
```

### Windows Service:
```cmd
# Run as Administrator
npm run install-service

# Start service
net start USBMonitorService
```

## Troubleshooting

### Issue: "Cannot find module 'node-usb-detection'"
**Solution:** This is expected on some systems. The service will use system polling instead.

### Issue: "Permission denied" errors
**Solution:**
```bash
# macOS/Linux: Add user to appropriate groups
sudo dscl . append /Groups/admin GroupMembership $USER  # macOS
sudo usermod -a -G dialout $USER                        # Linux

# Then logout and login again
```

### Issue: "No USB devices detected"
**Solutions:**
1. Check if USB devices are actually connected
2. Try running with sudo (for testing only)
3. Check system logs: `tail -f logs/combined.log`

### Issue: Service won't start
**Check:**
1. Port 3001 is available: `lsof -i :3001`
2. Check logs: `tail -f logs/*.log`
3. Try different port: `PORT=3002 npm start`

## Configuration

### Environment Variables:
Create a `.env` file:
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

### USB Detection Method Priority:
1. `node-usb-detection` (if available)
2. `usb` library with polling (if available)
3. System commands (always available)

The service automatically selects the best available method.

## API Endpoints

Once running, these endpoints will be available:

- `GET /health` - Health check
- `GET /api/devices` - Current USB devices
- `GET /api/history` - Connection history
- `GET /api/status` - Service status
- `WebSocket` - Real-time events at `ws://localhost:3001`

## Next Steps

1. **Test the basic installation:**
   ```bash
   npm install
   npm run dev
   ```

2. **Check if it works:**
   - Visit `http://localhost:3001/health`
   - Connect/disconnect a USB device
   - Check `http://localhost:3001/api/devices`

3. **Build the React frontend** to connect to this backend

4. **Install as service** (optional) for production use

The service is designed to be resilient and will work even if some native libraries fail to install. The system command fallback is very reliable across all platforms.