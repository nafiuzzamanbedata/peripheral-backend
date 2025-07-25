# USB Monitor Service

A cross-platform Node.js service that monitors USB device connections and disconnections, providing real-time updates through REST APIs and WebSocket connections.

## Features

- 🔌 **Real-time USB Monitoring**: Detects USB device connect/disconnect events instantly
- 🌐 **REST API**: Complete API for device management and history
- ⚡ **WebSocket Support**: Real-time updates for connected clients
- 🖥️ **Cross-Platform**: Works on Windows, macOS, and Linux
- 🛠️ **Service Installation**: Can be installed as a system service
- 📊 **Device Statistics**: Comprehensive device and connection analytics
- 📝 **Logging**: Detailed logging with rotation support
- 🔒 **Security**: Built-in security headers and CORS protection

## Prerequisites

- Node.js 16+ 
- npm or yarn
- Administrative privileges (for service installation and USB access)

### Platform-Specific Requirements

**Windows:**
- May require running as Administrator for USB access
- Uses `node-windows` for service management

**Linux:**
- Requires root privileges for USB monitoring
- Uses systemd for service management
- May need udev rules for USB device permissions

**macOS:**
- Requires sudo for service installation
- Uses LaunchDaemon for service management

## Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd usb-monitor-service
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env file with your settings
```

3. **Test the service:**
```bash
npm run dev
```

## Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Settings
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=info
LOG_FILE=logs/usb-monitor.log

# Service Configuration
SERVICE_NAME=USBMonitorService
SERVICE_DESCRIPTION=USB Device Monitoring Service
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Install as System Service
```bash
# Install service
npm run install-service

# Start service (varies by platform)
# Windows:
net start USBMonitorService

# Linux:
sudo systemctl start usbmonitorservice
sudo systemctl enable usbmonitorservice

# macOS:
sudo launchctl load /Library/LaunchDaemons/com.usbmonitor.usbmonitorservice.plist
```

### Uninstall Service
```bash
npm run uninstall-service
```

## API Endpoints

### REST API

- `GET /` - Service information
- `GET /health` - Health check
- `GET /api/devices` - Get all connected devices
- `GET /api/devices/:id` - Get specific device
- `GET /api/history` - Get connection history
- `GET /api/status` - Get service status
- `GET /api/stats` - Get device statistics
- `POST /api/devices/refresh` - Refresh device list

### WebSocket Events

**Client → Server:**
- `devices:get` - Request current devices
- `devices:refresh` - Refresh device list
- `history:get` - Request connection history
- `status:get` - Request service status
- `ping` - Connection test

**Server → Client:**
- `devices:initial` - Initial device list on connection
- `device:connected` - Device connected event
- `device:disconnected` - Device disconnected event
- `devices:refreshed` - Device list refreshed
- `history:initial` - Initial history on connection
- `status:update` - Status updates
- `error` - Error messages

## Example API Responses

### Get Devices
```json
{
  "success": true,
  "data": [
    {
      "id": "1234-5678-serial123",
      "vendorId": 1234,
      "productId": 5678,
      "serialNumber": "serial123",
      "manufacturer": "Example Corp",
      "productName": "USB Device",
      "status": "connected",
      "connectedAt": "2024-01-15T10:30:00.000Z",
      "lastSeen": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### WebSocket Device Event
```json
{
  "type": "device:connected",
  "device": {
    "id": "1234-5678-serial123",
    "vendorId": 1234,
    "productId": 5678,
    "manufacturer": "Example Corp",
    "productName": "USB Device",
    "status": "connected",
    "connectedAt": "2024-01-15T10:30:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Client Integration

### JavaScript/Node.js
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3001');

// Listen for device events
socket.on('device:connected', (data) => {
  console.log('Device connected:', data.device);
});

socket.on('device:disconnected', (data) => {
  console.log('Device disconnected:', data.device);
});

// Request current devices
socket.emit('devices:get');
```

### REST API with fetch
```javascript
// Get current devices
const response = await fetch('http://localhost:3001/api/devices');
const data = await response.json();
console.log('Devices:', data.data);

// Get connection history
const historyResponse = await fetch('http://localhost:3001/api/history?limit=20');
const historyData = await historyResponse.json();
console.log('History:', historyData.data);
```

## Logging

Logs are written to the `logs/` directory:
- `combined.log` - All log entries
- `error.log` - Error entries only
- `exceptions.log` - Uncaught exceptions

Log levels: `error`, `warn`, `info`, `debug`

## Troubleshooting

### Permission Issues
**Linux/macOS:**
```bash
# Add user to dialout group (Linux)
sudo usermod -a -G dialout $USER

# Create udev rule for USB access (Linux)
echo 'SUBSYSTEM=="usb", MODE="0666"' | sudo tee /etc/udev/rules.d/99-usb.rules
sudo udevadm control --reload-rules
```

**Windows:**
- Run as Administrator
- Install any required USB drivers

### Common Issues

1. **"Cannot find USB devices"**
   - Check permissions
   - Ensure USB devices are properly connected
   - Verify driver installation

2. **"Service won't start"**
   - Check logs in `logs/` directory
   - Verify port availability
   - Check system service logs

3. **"WebSocket connection failed"**
   - Verify CORS settings
   - Check firewall rules
   - Ensure service is running

## Development

### Project Structure
```
├── src/
│   ├── server.js           # Main server file
│   ├── usb-manager.js      # USB monitoring logic
│   ├── routes/
│   │   └── api.js          # REST API routes
│   ├── socket/
│   │   └── socketHandler.js # WebSocket handling
│   └── utils/
│       └── logger.js       # Logging configuration
├── scripts/
│   ├── install-service.js  # Service installation
│   └── uninstall-service.js # Service removal
├── logs/                   # Log files
├── docs/                   # Documentation
└── package.json
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Testing

```bash
# Run the service in development mode
npm run dev

# Test API endpoints
curl http://localhost:3001/api/devices
curl http://localhost:3001/health

# Test WebSocket connection
# Use a WebSocket client to connect to ws://localhost:3001
```

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the logs in `logs/` directory
2. Review the troubleshooting section
3. Create an issue on GitHub