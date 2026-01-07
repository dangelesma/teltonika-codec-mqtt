# Teltonika Codec to MQTT with Bidirectional Commands

This TypeScript project converts Teltonika device TCP connections (Codec 8/8E) to MQTT, with full **Codec 12 bidirectional command support** for FMB920 and compatible devices.

## Features

- ✅ **Codec 8/8E Support**: Receive telemetry data from Teltonika devices
- ✅ **Codec 12 Commands**: Send GPRS commands to devices via MQTT
- ✅ **MQTT Integration**: Publish data and receive commands via MQTT broker
- ✅ **Web Dashboard**: Real-time web interface for device management
- ✅ **Multi-Device Support**: Track and manage multiple devices simultaneously
- ✅ **Security Features**: API authentication, IMEI whitelist, rate limiting, IP blocking
- ✅ **Docker Ready**: Deploy with Docker Compose or Dokploy
- ✅ **OpenRemote Compatible**: Works with OpenRemote IoT platform

## Quick Start with Docker Compose

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/teltonika-codec-mqtt.git
cd teltonika-codec-mqtt
```

2. Create your `.env` file:
```bash
cp .env.example .env
# Edit .env with your MQTT broker settings
```

3. Run the server:
```bash
docker-compose up -d
```

4. Open web dashboard: `http://localhost:3000`

## Web Dashboard

Access the web dashboard at `http://your-server:3000` to:

- 📱 View all connected devices in real-time
- 📍 Monitor device positions and telemetry
- 💬 Send commands to devices directly
- 📋 View system logs
- 🔒 Configure security settings

### Security Settings (Web UI)

All security features can be configured from the web interface:

- **API Key Authentication**: Protect API endpoints
- **IMEI Whitelist**: Only allow specific devices
- **Rate Limiting**: Prevent abuse
- **IP Whitelist/Blocking**: Control access by IP

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `mqttOptions__host` | localhost | MQTT broker hostname |
| `mqttOptions__port` | 1883 | MQTT broker port |
| `mqttOptions__protocol` | mqtt | Protocol (mqtt, mqtts, ws, wss) |
| `orOpts__realm` | master | MQTT topic realm prefix |
| `orOpts__teltonika_keyword` | teltonika | Topic keyword for Teltonika |
| `orOpts__dataTopic` | data | Data topic suffix |
| `orOpts__commandTopic` | commands | Command topic suffix |
| `udpServerOptions__port` | 8833 | TCP port for device connections |
| `webApiPort` | 3000 | Web dashboard/API port |

### Security Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECURITY_API_KEY_ENABLED` | false | Enable API key authentication |
| `SECURITY_API_KEY` | (auto-generated) | API key for protected endpoints |
| `SECURITY_IMEI_WHITELIST_ENABLED` | false | Enable IMEI whitelist |
| `SECURITY_IMEI_WHITELIST` | "" | Comma-separated allowed IMEIs |
| `SECURITY_RATE_LIMIT_ENABLED` | true | Enable rate limiting |
| `SECURITY_RATE_LIMIT_WINDOW` | 60000 | Rate limit window (ms) |
| `SECURITY_RATE_LIMIT_MAX_REQUESTS` | 100 | Max requests per window |
| `SECURITY_IP_WHITELIST_ENABLED` | false | Enable IP whitelist |
| `SECURITY_IP_WHITELIST` | "" | Comma-separated allowed IPs |
| `SECURITY_MAX_DEVICES_PER_IP` | 5 | Max devices per IP address |
| `SECURITY_MAX_CONNECTION_ATTEMPTS` | 10 | Max connection attempts before block |

## REST API

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Server statistics |

### Protected Endpoints (require API key)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List all devices |
| GET | `/api/devices/:imei` | Get device details |
| POST | `/api/devices/:imei/command` | Send command to device |
| GET | `/api/logs` | Get system logs |
| GET | `/api/security` | Get security status |
| GET | `/api/security/config` | Get security configuration |
| PUT | `/api/security/config` | Update security configuration |
| GET | `/api/security/whitelist` | Get IMEI whitelist |
| POST | `/api/security/whitelist` | Add IMEI to whitelist |
| DELETE | `/api/security/whitelist/:imei` | Remove IMEI from whitelist |
| GET | `/api/security/blocked` | Get blocked IPs |
| POST | `/api/security/block` | Block an IP |
| DELETE | `/api/security/block/:ip` | Unblock an IP |

### API Authentication

Include API key in requests:
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/devices
# Or
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/api/devices
```

## MQTT Topics

### Data Topic (Device → MQTT)
```
{realm}/{uuid}/teltonika/{imei}/data
```

Telemetry data format:
```json
{
  "state": {
    "reported": {
      "latlng": "lat,lng",
      "ts": 1704672000000,
      "alt": "123",
      "ang": "180",
      "sat": "12",
      "sp": "60",
      "evt": "0"
    }
  }
}
```

### Command Topic (MQTT → Device)
```
{realm}/{uuid}/teltonika/{imei}/commands
```

Send plain text commands:
```
getinfo
getver
setparam 2001:30
```

### Command Response (Device → MQTT)
```json
{
  "state": {
    "reported": {
      "command_response": "Device response text",
      "ts": 1704672000000
    }
  }
}
```

## Codec 12 Commands

The server supports **Codec 12** for bidirectional GPRS commands:

1. **Subscribe to commands**: Server listens on `{realm}/{uuid}/teltonika/{imei}/commands`
2. **Send command**: Publish plain text command to the topic
3. **Receive response**: Response published to data topic with `command_response` field

### Example Commands for FMB920

| Command | Description |
|---------|-------------|
| `getinfo` | Get device information |
| `getver` | Get firmware version |
| `getstatus` | Get device status |
| `getgps` | Get current GPS position |
| `setparam 2001:30` | Set parameter (e.g., data sending period) |
| `cpureset` | Reset device |

## Deploy to Dokploy

1. Push repository to GitHub
2. In Dokploy, create new application from Git
3. Select **Docker Compose** deployment
4. Add environment variables in Dokploy settings
5. Deploy!

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development
npm run dev

# Run production
npm start
```

## Architecture

```
┌─────────────────┐      TCP/8833      ┌─────────────────────┐
│  Teltonika      │◄──────────────────►│  Teltonika Server   │
│  FMB920         │   Codec 8/8E/12    │  (This Project)     │
└─────────────────┘                    └──────────┬──────────┘
                                                  │
                                                  │ MQTT
                                                  ▼
                                       ┌─────────────────────┐
                                       │   MQTT Broker       │
                                       │   (OpenRemote/etc)  │
                                       └─────────────────────┘
```

## Libraries

- [`complete-teltonika-parser`](https://github.com/TimeLord2010/TeltonikaParser): Parse Teltonika Codec 8/8E payloads
- [`mqtt`](https://www.npmjs.com/package/mqtt): MQTT client for Node.js

## License

ISC
