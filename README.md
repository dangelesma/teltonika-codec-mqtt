# Teltonika Codec to MQTT with Bidirectional Commands

This TypeScript project converts Teltonika device TCP connections (Codec 8/8E) to MQTT, with full **Codec 12 bidirectional command support** for FMB920 and compatible devices.

## Features

- ✅ **Codec 8/8E Support**: Receive telemetry data from Teltonika devices
- ✅ **Codec 12 Commands**: Send GPRS commands to devices via MQTT
- ✅ **MQTT Integration**: Publish data and receive commands via MQTT broker
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
