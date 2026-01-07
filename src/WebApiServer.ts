/**
 * Web API Server - REST API and WebSocket for device management
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { deviceManager, DeviceInfo, LogEntry } from './DeviceManager';
import { commandManager } from './CommandManager';
import { securityManager } from './SecurityManager';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface ApiConfig {
  port: number;
  host: string;
}

export class WebApiServer {
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: ApiConfig;
  private wsClients: Map<WebSocket, { authenticated: boolean; ip: string }> = new Map();

  constructor(config: ApiConfig) {
    this.config = config;
    this.httpServer = createServer(this.handleRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.setupWebSocket();
    this.setupDeviceEvents();
  }

  /**
   * Start the server
   */
  start(): void {
    this.httpServer.listen(this.config.port, this.config.host, () => {
      deviceManager.log('info', 'WebAPI', `Web interface running at http://${this.config.host}:${this.config.port}`);
      // Show API key on startup if enabled
      if (process.env.SECURITY_API_KEY_ENABLED === 'true') {
        deviceManager.log('info', 'Security', `API Key authentication enabled. Key: ${securityManager.getApiKey()}`);
      }
    });
  }

  /**
   * Setup WebSocket connections
   */
  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const clientIp = securityManager.getClientIp(req);
      
      // Security: Check web access
      const accessCheck = securityManager.validateWebAccess(clientIp);
      if (!accessCheck.allowed) {
        deviceManager.log('warn', 'WebSocket', `Connection rejected from ${clientIp}: ${accessCheck.reason}`);
        ws.close(1008, accessCheck.reason);
        return;
      }
      
      deviceManager.log('info', 'WebSocket', `Client connected from ${clientIp}`);
      this.wsClients.set(ws, { authenticated: false, ip: clientIp });

      // Send initial state (limited if not authenticated)
      ws.send(JSON.stringify({
        type: 'init',
        data: {
          devices: deviceManager.getAllDevices(),
          stats: deviceManager.getStats(),
          logs: deviceManager.getLogs(50),
          security: securityManager.getStatus()
        }
      }));

      ws.on('message', async (message: Buffer) => {
        try {
          const msg = JSON.parse(message.toString());
          await this.handleWsMessage(ws, msg);
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(ws);
        deviceManager.log('info', 'WebSocket', 'Client disconnected');
      });
    });
  }

  /**
   * Setup device event listeners for real-time updates
   */
  private setupDeviceEvents(): void {
    deviceManager.on('deviceConnected', (device: DeviceInfo) => {
      this.broadcast({ type: 'deviceConnected', data: device });
    });

    deviceManager.on('deviceDisconnected', (device: DeviceInfo) => {
      this.broadcast({ type: 'deviceDisconnected', data: device });
    });

    deviceManager.on('positionUpdate', (device: DeviceInfo) => {
      this.broadcast({ type: 'positionUpdate', data: device });
    });

    deviceManager.on('commandSent', (data: any) => {
      this.broadcast({ type: 'commandSent', data });
    });

    deviceManager.on('commandResponse', (data: any) => {
      this.broadcast({ type: 'commandResponse', data });
    });

    deviceManager.on('log', (entry: LogEntry) => {
      this.broadcast({ type: 'log', data: entry });
    });
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.wsClients.forEach((clientInfo, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWsMessage(ws: WebSocket, msg: any): Promise<void> {
    switch (msg.type) {
      case 'sendCommand':
        if (msg.imei && msg.command) {
          const commandId = randomUUID();
          deviceManager.addCommand(msg.imei, commandId, msg.command);
          
          const response = await commandManager.sendCommand(msg.imei, msg.command);
          deviceManager.updateCommandResponse(
            msg.imei, 
            commandId, 
            response.response || '', 
            response.success, 
            response.error
          );
          
          ws.send(JSON.stringify({ 
            type: 'commandResult', 
            data: { imei: msg.imei, commandId, response } 
          }));
        }
        break;

      case 'getDevices':
        ws.send(JSON.stringify({ 
          type: 'devices', 
          data: deviceManager.getAllDevices() 
        }));
        break;

      case 'getLogs':
        ws.send(JSON.stringify({ 
          type: 'logs', 
          data: deviceManager.getLogs(msg.limit || 100, msg.level) 
        }));
        break;

      case 'clearLogs':
        deviceManager.clearLogs();
        ws.send(JSON.stringify({ type: 'logsCleared' }));
        break;

      case 'getStats':
        ws.send(JSON.stringify({ 
          type: 'stats', 
          data: deviceManager.getStats() 
        }));
        break;
    }
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const clientIp = securityManager.getClientIp(req);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Security: Rate limit check
    const rateLimit = securityManager.checkRateLimit(clientIp);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetIn / 1000).toString());
    
    if (!rateLimit.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Rate limit exceeded' }));
      return;
    }

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      await this.handleApiRequest(req, res, url, clientIp);
      return;
    }

    // Static files / Web UI
    this.serveStaticFile(req, res, url);
  }

  /**
   * Handle API requests
   */
  private async handleApiRequest(req: IncomingMessage, res: ServerResponse, url: URL, clientIp: string): Promise<void> {
    const sendJson = (data: any, status: number = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Security: Validate API authentication for protected endpoints
    const publicEndpoints = ['/api/health', '/api/stats'];
    const isPublic = publicEndpoints.includes(url.pathname);
    
    if (!isPublic) {
      const authResult = securityManager.validateApiAuth(req);
      if (!authResult.valid) {
        sendJson({ success: false, error: authResult.error }, 401);
        return;
      }
    }

    try {
      // GET /api/health - Health check (public)
      if (url.pathname === '/api/health' && req.method === 'GET') {
        sendJson({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
        return;
      }

      // GET /api/stats - Get statistics (public)
      if (url.pathname === '/api/stats' && req.method === 'GET') {
        sendJson({ success: true, stats: deviceManager.getStats() });
        return;
      }

      // GET /api/security - Get security status
      if (url.pathname === '/api/security' && req.method === 'GET') {
        sendJson({ success: true, security: securityManager.getStatus() });
        return;
      }

      // GET /api/security/whitelist - Get IMEI whitelist
      if (url.pathname === '/api/security/whitelist' && req.method === 'GET') {
        sendJson({ success: true, whitelist: securityManager.getImeiWhitelist() });
        return;
      }

      // POST /api/security/whitelist - Add IMEI to whitelist
      if (url.pathname === '/api/security/whitelist' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { imei } = JSON.parse(body);
        if (!imei) {
          sendJson({ success: false, error: 'IMEI is required' }, 400);
          return;
        }
        securityManager.addImeiToWhitelist(imei);
        sendJson({ success: true, message: `IMEI ${imei} added to whitelist` });
        return;
      }

      // DELETE /api/security/whitelist/:imei - Remove IMEI from whitelist
      const whitelistMatch = url.pathname.match(/^\/api\/security\/whitelist\/(\d+)$/);
      if (whitelistMatch && req.method === 'DELETE') {
        securityManager.removeImeiFromWhitelist(whitelistMatch[1]);
        sendJson({ success: true, message: `IMEI ${whitelistMatch[1]} removed from whitelist` });
        return;
      }

      // GET /api/security/blocked - Get blocked IPs
      if (url.pathname === '/api/security/blocked' && req.method === 'GET') {
        sendJson({ success: true, blockedIps: securityManager.getBlockedIps() });
        return;
      }

      // POST /api/security/block - Block an IP
      if (url.pathname === '/api/security/block' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { ip, duration } = JSON.parse(body);
        if (!ip) {
          sendJson({ success: false, error: 'IP is required' }, 400);
          return;
        }
        securityManager.blockIp(ip, duration || 3600000);
        sendJson({ success: true, message: `IP ${ip} blocked` });
        return;
      }

      // DELETE /api/security/block/:ip - Unblock an IP
      if (url.pathname.startsWith('/api/security/block/') && req.method === 'DELETE') {
        const ip = url.pathname.replace('/api/security/block/', '');
        securityManager.unblockIp(ip);
        sendJson({ success: true, message: `IP ${ip} unblocked` });
        return;
      }

      // GET /api/security/config - Get full security configuration
      if (url.pathname === '/api/security/config' && req.method === 'GET') {
        const config = securityManager.getFullConfig();
        // Hide API key value for security
        sendJson({ 
          success: true, 
          config: { 
            ...config, 
            apiKey: config.apiKey ? '********' : '' 
          } 
        });
        return;
      }

      // PUT /api/security/config - Update security configuration
      if (url.pathname === '/api/security/config' && req.method === 'PUT') {
        const body = await this.readBody(req);
        const updates = JSON.parse(body);
        
        // Validate and sanitize updates
        const allowedKeys = [
          'apiKeyEnabled', 'imeiWhitelistEnabled', 'rateLimitEnabled',
          'rateLimitWindow', 'rateLimitMaxRequests', 'ipWhitelistEnabled',
          'maxDevicesPerIp', 'maxConnectionAttempts', 'connectionAttemptWindow'
        ];
        
        const sanitizedUpdates: any = {};
        for (const key of allowedKeys) {
          if (updates[key] !== undefined) {
            sanitizedUpdates[key] = updates[key];
          }
        }
        
        // Handle arrays separately
        if (updates.imeiWhitelist && Array.isArray(updates.imeiWhitelist)) {
          sanitizedUpdates.imeiWhitelist = updates.imeiWhitelist;
        }
        if (updates.ipWhitelist && Array.isArray(updates.ipWhitelist)) {
          sanitizedUpdates.ipWhitelist = updates.ipWhitelist;
        }
        
        // Allow updating API key only if explicitly provided and not empty
        if (updates.apiKey && updates.apiKey.length > 0 && updates.apiKey !== '********') {
          sanitizedUpdates.apiKey = updates.apiKey;
        }
        
        securityManager.updateConfig(sanitizedUpdates);
        sendJson({ success: true, message: 'Configuration updated' });
        return;
      }

      // POST /api/security/config/regenerate-key - Generate new API key
      if (url.pathname === '/api/security/config/regenerate-key' && req.method === 'POST') {
        const { randomBytes } = await import('crypto');
        const newKey = randomBytes(32).toString('hex');
        securityManager.updateConfig({ apiKey: newKey });
        sendJson({ success: true, apiKey: newKey });
        return;
      }

      // GET /api/devices - List all devices
      if (url.pathname === '/api/devices' && req.method === 'GET') {
        sendJson({ success: true, devices: deviceManager.getAllDevices() });
        return;
      }

      // GET /api/devices/:imei - Get specific device
      const deviceMatch = url.pathname.match(/^\/api\/devices\/(\d+)$/);
      if (deviceMatch && req.method === 'GET') {
        const device = deviceManager.getDevice(deviceMatch[1]);
        if (device) {
          sendJson({ success: true, device });
        } else {
          sendJson({ success: false, error: 'Device not found' }, 404);
        }
        return;
      }

      // POST /api/devices/:imei/command - Send command to device
      const commandMatch = url.pathname.match(/^\/api\/devices\/(\d+)\/command$/);
      if (commandMatch && req.method === 'POST') {
        const body = await this.readBody(req);
        const { command } = JSON.parse(body);
        
        if (!command) {
          sendJson({ success: false, error: 'Command is required' }, 400);
          return;
        }

        const imei = commandMatch[1];
        const commandId = randomUUID();
        deviceManager.addCommand(imei, commandId, command);
        
        const response = await commandManager.sendCommand(imei, command);
        deviceManager.updateCommandResponse(imei, commandId, response.response || '', response.success, response.error);
        
        sendJson({ success: true, commandId, response });
        return;
      }

      // GET /api/stats - Get statistics
      if (url.pathname === '/api/stats' && req.method === 'GET') {
        sendJson({ success: true, stats: deviceManager.getStats() });
        return;
      }

      // GET /api/logs - Get logs
      if (url.pathname === '/api/logs' && req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const level = url.searchParams.get('level') as LogEntry['level'] | undefined;
        sendJson({ success: true, logs: deviceManager.getLogs(limit, level) });
        return;
      }

      // DELETE /api/logs - Clear logs
      if (url.pathname === '/api/logs' && req.method === 'DELETE') {
        deviceManager.clearLogs();
        sendJson({ success: true });
        return;
      }

      // 404 for unknown API routes
      sendJson({ success: false, error: 'Not found' }, 404);
      
    } catch (error) {
      deviceManager.log('error', 'WebAPI', 'API Error', error);
      sendJson({ success: false, error: 'Internal server error' }, 500);
    }
  }

  /**
   * Serve static files
   */
  private serveStaticFile(req: IncomingMessage, res: ServerResponse, url: URL): void {
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    
    // Serve embedded HTML for simplicity
    if (filePath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getIndexHtml());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  /**
   * Read request body
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Get embedded HTML for web interface
   */
  private getIndexHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Teltonika Device Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { background: #16213e; padding: 20px; margin-bottom: 20px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
    header h1 { color: #00d9ff; }
    .status { display: flex; gap: 20px; }
    .status-item { text-align: center; }
    .status-item .value { font-size: 24px; font-weight: bold; color: #00d9ff; }
    .status-item .label { font-size: 12px; color: #888; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .panel { background: #16213e; border-radius: 10px; padding: 20px; }
    .panel h2 { color: #00d9ff; margin-bottom: 15px; font-size: 18px; border-bottom: 1px solid #333; padding-bottom: 10px; }
    .device-list { max-height: 300px; overflow-y: auto; }
    .device { background: #0f3460; padding: 15px; border-radius: 8px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s; }
    .device:hover { background: #1a4a7a; }
    .device.selected { border: 2px solid #00d9ff; }
    .device-header { display: flex; justify-content: space-between; align-items: center; }
    .device-imei { font-weight: bold; font-size: 16px; }
    .device-status { padding: 3px 10px; border-radius: 20px; font-size: 12px; }
    .device-status.online { background: #00c853; color: #000; }
    .device-status.offline { background: #ff5252; color: #fff; }
    .device-info { margin-top: 10px; font-size: 13px; color: #aaa; }
    .device-position { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 8px; }
    .device-position span { background: #1a1a2e; padding: 5px; border-radius: 4px; text-align: center; }
    .command-panel { margin-top: 20px; }
    .command-input { display: flex; gap: 10px; }
    .command-input input { flex: 1; padding: 12px; border: none; border-radius: 8px; background: #0f3460; color: #fff; font-size: 14px; }
    .command-input input:focus { outline: 2px solid #00d9ff; }
    .command-input button { padding: 12px 24px; border: none; border-radius: 8px; background: #00d9ff; color: #000; font-weight: bold; cursor: pointer; transition: all 0.2s; }
    .command-input button:hover { background: #00b8d4; }
    .command-input button:disabled { background: #555; cursor: not-allowed; }
    .quick-commands { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .quick-commands button { padding: 8px 12px; border: 1px solid #00d9ff; border-radius: 6px; background: transparent; color: #00d9ff; cursor: pointer; font-size: 12px; }
    .quick-commands button:hover { background: #00d9ff; color: #000; }
    .command-history { max-height: 200px; overflow-y: auto; margin-top: 15px; }
    .cmd-entry { padding: 10px; background: #0f3460; border-radius: 6px; margin-bottom: 8px; font-size: 13px; }
    .cmd-entry .cmd { color: #00d9ff; }
    .cmd-entry .response { color: #4caf50; margin-top: 5px; word-break: break-all; }
    .cmd-entry .error { color: #ff5252; }
    .cmd-entry .time { color: #666; font-size: 11px; }
    .logs-panel { margin-top: 20px; }
    .logs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .logs-filter { display: flex; gap: 8px; }
    .logs-filter button { padding: 5px 12px; border: 1px solid #444; border-radius: 4px; background: transparent; color: #aaa; cursor: pointer; font-size: 12px; }
    .logs-filter button.active { background: #00d9ff; color: #000; border-color: #00d9ff; }
    .logs-container { max-height: 300px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 12px; background: #0a0a15; border-radius: 8px; padding: 10px; }
    .log-entry { padding: 4px 0; border-bottom: 1px solid #1a1a2e; }
    .log-entry .time { color: #666; }
    .log-entry .level { padding: 2px 6px; border-radius: 3px; margin: 0 8px; font-size: 10px; }
    .log-entry .level.info { background: #2196f3; }
    .log-entry .level.warn { background: #ff9800; color: #000; }
    .log-entry .level.error { background: #f44336; }
    .log-entry .level.debug { background: #9c27b0; }
    .log-entry .source { color: #00d9ff; }
    .log-entry .message { color: #ddd; }
    .connection-status { display: flex; align-items: center; gap: 8px; }
    .connection-dot { width: 10px; height: 10px; border-radius: 50%; }
    .connection-dot.connected { background: #00c853; }
    .connection-dot.disconnected { background: #ff5252; }
    .no-device { text-align: center; padding: 40px; color: #666; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { padding: 10px 20px; border: 1px solid #333; border-radius: 8px; background: transparent; color: #aaa; cursor: pointer; font-size: 14px; }
    .tab.active { background: #00d9ff; color: #000; border-color: #00d9ff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .settings-section { background: #0f3460; padding: 20px; border-radius: 8px; }
    .settings-section h3 { color: #00d9ff; margin-bottom: 15px; font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 8px; }
    .setting-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #1a1a2e; }
    .setting-row:last-child { border-bottom: none; }
    .setting-label { color: #ddd; font-size: 14px; }
    .setting-desc { color: #666; font-size: 12px; margin-top: 2px; }
    .toggle { position: relative; width: 50px; height: 26px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #555; border-radius: 26px; transition: 0.3s; }
    .toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
    .toggle input:checked + .toggle-slider { background: #00d9ff; }
    .toggle input:checked + .toggle-slider:before { transform: translateX(24px); }
    .input-field { padding: 8px 12px; border: 1px solid #333; border-radius: 6px; background: #1a1a2e; color: #fff; font-size: 14px; width: 150px; }
    .input-field:focus { outline: 2px solid #00d9ff; border-color: transparent; }
    .list-manager { margin-top: 15px; }
    .list-items { max-height: 150px; overflow-y: auto; background: #1a1a2e; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
    .list-item { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #0f3460; border-radius: 4px; margin-bottom: 5px; }
    .list-item:last-child { margin-bottom: 0; }
    .list-item button { background: #f44336; border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .list-add { display: flex; gap: 8px; }
    .list-add input { flex: 1; padding: 8px; border: 1px solid #333; border-radius: 6px; background: #1a1a2e; color: #fff; }
    .list-add button { padding: 8px 16px; background: #00d9ff; border: none; border-radius: 6px; color: #000; cursor: pointer; font-weight: bold; }
    .api-key-display { display: flex; gap: 10px; align-items: center; }
    .api-key-display input { flex: 1; }
    .btn-secondary { padding: 8px 12px; background: #333; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 12px; }
    .btn-secondary:hover { background: #444; }
    .btn-danger { background: #f44336; }
    .btn-danger:hover { background: #d32f2f; }
    .save-status { padding: 10px; border-radius: 6px; margin-top: 15px; text-align: center; display: none; }
    .save-status.success { display: block; background: #1b5e20; color: #4caf50; }
    .save-status.error { display: block; background: #b71c1c; color: #ff5252; }
    .security-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
    .security-stat { background: #0f3460; padding: 15px; border-radius: 8px; text-align: center; }
    .security-stat .value { font-size: 24px; font-weight: bold; color: #00d9ff; }
    .security-stat .label { font-size: 12px; color: #888; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🛰️ Teltonika Device Manager</h1>
      <div class="status">
        <div class="status-item">
          <div class="value" id="stat-online">0</div>
          <div class="label">Online</div>
        </div>
        <div class="status-item">
          <div class="value" id="stat-total">0</div>
          <div class="label">Total</div>
        </div>
        <div class="status-item">
          <div class="value" id="stat-messages">0</div>
          <div class="label">Messages</div>
        </div>
        <div class="connection-status">
          <div class="connection-dot" id="ws-status"></div>
          <span id="ws-text">Connecting...</span>
        </div>
      </div>
    </header>

    <div class="tabs">
      <button class="tab active" data-tab="devices">📱 Devices</button>
      <button class="tab" data-tab="security">🔒 Security</button>
      <button class="tab" data-tab="logs">📋 Logs</button>
    </div>

    <div id="tab-devices" class="tab-content active">
      <div class="grid">
        <div class="panel">
          <h2>📱 Connected Devices</h2>
        <div class="device-list" id="device-list">
          <div class="no-device">No devices connected</div>
        </div>
      </div>

      <div class="panel">
        <h2>📍 Device Details</h2>
        <div id="device-details">
          <div class="no-device">Select a device to view details</div>
        </div>
        
        <div class="command-panel" id="command-panel" style="display: none;">
          <h3 style="color: #00d9ff; margin-bottom: 10px; font-size: 14px;">Send Command</h3>
          <div class="command-input">
            <input type="text" id="command-input" placeholder="Enter command (e.g., getinfo)" />
            <button id="send-command">Send</button>
          </div>
          <div class="quick-commands">
            <button data-cmd="getinfo">getinfo</button>
            <button data-cmd="getver">getver</button>
            <button data-cmd="getstatus">getstatus</button>
            <button data-cmd="getgps">getgps</button>
            <button data-cmd="getio">getio</button>
            <button data-cmd="getparam 2001">getparam 2001</button>
          </div>
          <div class="command-history" id="command-history"></div>
        </div>
      </div>
    </div>
  </div>

  <div id="tab-security" class="tab-content">
    <div class="security-stats">
      <div class="security-stat">
        <div class="value" id="sec-blocked">0</div>
        <div class="label">Blocked IPs</div>
      </div>
      <div class="security-stat">
        <div class="value" id="sec-whitelist">0</div>
        <div class="label">IMEI Whitelist</div>
      </div>
      <div class="security-stat">
        <div class="value" id="sec-connections">0</div>
        <div class="label">Active Connections</div>
      </div>
      <div class="security-stat">
        <div class="value" id="sec-rejected">0</div>
        <div class="label">Rejected Today</div>
      </div>
    </div>

    <div class="settings-grid">
      <div class="settings-section">
        <h3>🔑 API Authentication</h3>
        <div class="setting-row">
          <div>
            <div class="setting-label">Enable API Key</div>
            <div class="setting-desc">Require API key for protected endpoints</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="cfg-apiKeyEnabled">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="api-key-display" style="margin-top: 15px;">
          <input type="text" class="input-field" id="cfg-apiKey" placeholder="API Key" style="width: 100%;" readonly>
          <button class="btn-secondary" onclick="copyApiKey()">Copy</button>
          <button class="btn-secondary btn-danger" onclick="regenerateApiKey()">Regenerate</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>📋 IMEI Whitelist</h3>
        <div class="setting-row">
          <div>
            <div class="setting-label">Enable IMEI Whitelist</div>
            <div class="setting-desc">Only allow whitelisted IMEI numbers</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="cfg-imeiWhitelistEnabled">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="list-manager">
          <div class="list-items" id="imei-whitelist"></div>
          <div class="list-add">
            <input type="text" id="new-imei" placeholder="Enter IMEI (15 digits)">
            <button onclick="addImeiToWhitelist()">Add</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>⏱️ Rate Limiting</h3>
        <div class="setting-row">
          <div>
            <div class="setting-label">Enable Rate Limiting</div>
            <div class="setting-desc">Limit requests per IP address</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="cfg-rateLimitEnabled">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Window (ms)</div>
            <div class="setting-desc">Time window for rate limiting</div>
          </div>
          <input type="number" class="input-field" id="cfg-rateLimitWindow" min="1000" step="1000">
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Max Requests</div>
            <div class="setting-desc">Max requests per window</div>
          </div>
          <input type="number" class="input-field" id="cfg-rateLimitMaxRequests" min="1">
        </div>
      </div>

      <div class="settings-section">
        <h3>🌐 IP Restrictions</h3>
        <div class="setting-row">
          <div>
            <div class="setting-label">Enable IP Whitelist</div>
            <div class="setting-desc">Only allow whitelisted IPs</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="cfg-ipWhitelistEnabled">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Max Devices per IP</div>
            <div class="setting-desc">Limit connections from same IP</div>
          </div>
          <input type="number" class="input-field" id="cfg-maxDevicesPerIp" min="1">
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Max Connection Attempts</div>
            <div class="setting-desc">Before auto-blocking IP</div>
          </div>
          <input type="number" class="input-field" id="cfg-maxConnectionAttempts" min="1">
        </div>
      </div>

      <div class="settings-section">
        <h3>🛡️ IP Whitelist</h3>
        <div class="list-manager">
          <div class="list-items" id="ip-whitelist"></div>
          <div class="list-add">
            <input type="text" id="new-ip-whitelist" placeholder="Enter IP address">
            <button onclick="addIpToWhitelist()">Add</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>🚫 Blocked IPs</h3>
        <div class="list-manager">
          <div class="list-items" id="blocked-ips"></div>
          <div class="list-add">
            <input type="text" id="new-blocked-ip" placeholder="Enter IP to block">
            <button onclick="blockIp()">Block</button>
          </div>
        </div>
      </div>
    </div>

    <div class="save-status" id="save-status"></div>
    <div style="margin-top: 20px; text-align: center;">
      <button class="command-input button" style="padding: 12px 40px; background: #00d9ff; border: none; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; font-size: 16px;" onclick="saveSecurityConfig()">💾 Save All Settings</button>
    </div>
  </div>

    <div id="tab-logs" class="tab-content">
    <div class="panel logs-panel">
      <div class="logs-header">
        <h2>📋 System Logs</h2>
        <div class="logs-filter">
          <button class="active" data-level="all">All</button>
          <button data-level="info">Info</button>
          <button data-level="warn">Warn</button>
          <button data-level="error">Error</button>
          <button id="clear-logs" style="background: #f44336; color: #fff; border-color: #f44336;">Clear</button>
        </div>
      </div>
      <div class="logs-container" id="logs-container"></div>
    </div>
  </div>
  </div>

  <script>
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = wsProtocol + '//' + window.location.host;
    let ws;
    let devices = {};
    let selectedImei = null;
    let logFilter = 'all';
    let securityConfig = {};

    function connect() {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        document.getElementById('ws-status').className = 'connection-dot connected';
        document.getElementById('ws-text').textContent = 'Connected';
        loadSecurityConfig();
      };

      ws.onclose = () => {
        document.getElementById('ws-status').className = 'connection-dot disconnected';
        document.getElementById('ws-text').textContent = 'Disconnected';
        setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      };
    }

    async function loadSecurityConfig() {
      try {
        const res = await fetch('/api/security/config');
        const data = await res.json();
        if (data.success) {
          securityConfig = data.config;
          renderSecurityConfig();
        }
        
        const secRes = await fetch('/api/security');
        const secData = await secRes.json();
        if (secData.success) {
          document.getElementById('sec-blocked').textContent = secData.security.blockedIps;
          document.getElementById('sec-whitelist').textContent = secData.security.imeiWhitelistCount;
          document.getElementById('sec-connections').textContent = secData.security.activeConnections || 0;
          document.getElementById('sec-rejected').textContent = secData.security.rejectedToday || 0;
        }
        
        const blockedRes = await fetch('/api/security/blocked');
        const blockedData = await blockedRes.json();
        if (blockedData.success) {
          renderBlockedIps(blockedData.blockedIps);
        }
      } catch (e) {
        console.error('Failed to load security config:', e);
      }
    }

    function renderSecurityConfig() {
      document.getElementById('cfg-apiKeyEnabled').checked = securityConfig.apiKeyEnabled;
      document.getElementById('cfg-apiKey').value = securityConfig.apiKey || '';
      document.getElementById('cfg-imeiWhitelistEnabled').checked = securityConfig.imeiWhitelistEnabled;
      document.getElementById('cfg-rateLimitEnabled').checked = securityConfig.rateLimitEnabled;
      document.getElementById('cfg-rateLimitWindow').value = securityConfig.rateLimitWindow || 60000;
      document.getElementById('cfg-rateLimitMaxRequests').value = securityConfig.rateLimitMaxRequests || 100;
      document.getElementById('cfg-ipWhitelistEnabled').checked = securityConfig.ipWhitelistEnabled;
      document.getElementById('cfg-maxDevicesPerIp').value = securityConfig.maxDevicesPerIp || 5;
      document.getElementById('cfg-maxConnectionAttempts').value = securityConfig.maxConnectionAttempts || 10;
      
      renderImeiWhitelist(securityConfig.imeiWhitelist || []);
      renderIpWhitelist(securityConfig.ipWhitelist || []);
    }

    function renderImeiWhitelist(list) {
      const container = document.getElementById('imei-whitelist');
      if (list.length === 0) {
        container.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">No IMEIs in whitelist</div>';
        return;
      }
      container.innerHTML = list.map(imei => \`
        <div class="list-item">
          <span>\${imei}</span>
          <button onclick="removeImeiFromWhitelist('\${imei}')">Remove</button>
        </div>
      \`).join('');
    }

    function renderIpWhitelist(list) {
      const container = document.getElementById('ip-whitelist');
      if (list.length === 0) {
        container.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">No IPs in whitelist</div>';
        return;
      }
      container.innerHTML = list.map(ip => \`
        <div class="list-item">
          <span>\${ip}</span>
          <button onclick="removeIpFromWhitelist('\${ip}')">Remove</button>
        </div>
      \`).join('');
    }

    function renderBlockedIps(list) {
      const container = document.getElementById('blocked-ips');
      if (list.length === 0) {
        container.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">No blocked IPs</div>';
        return;
      }
      container.innerHTML = list.map(ip => \`
        <div class="list-item">
          <span>\${ip}</span>
          <button onclick="unblockIp('\${ip}')">Unblock</button>
        </div>
      \`).join('');
    }

    async function saveSecurityConfig() {
      const config = {
        apiKeyEnabled: document.getElementById('cfg-apiKeyEnabled').checked,
        imeiWhitelistEnabled: document.getElementById('cfg-imeiWhitelistEnabled').checked,
        rateLimitEnabled: document.getElementById('cfg-rateLimitEnabled').checked,
        rateLimitWindow: parseInt(document.getElementById('cfg-rateLimitWindow').value),
        rateLimitMaxRequests: parseInt(document.getElementById('cfg-rateLimitMaxRequests').value),
        ipWhitelistEnabled: document.getElementById('cfg-ipWhitelistEnabled').checked,
        maxDevicesPerIp: parseInt(document.getElementById('cfg-maxDevicesPerIp').value),
        maxConnectionAttempts: parseInt(document.getElementById('cfg-maxConnectionAttempts').value),
      };
      
      try {
        const res = await fetch('/api/security/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        const data = await res.json();
        showSaveStatus(data.success, data.success ? 'Configuration saved!' : data.error);
      } catch (e) {
        showSaveStatus(false, 'Failed to save configuration');
      }
    }

    function showSaveStatus(success, message) {
      const el = document.getElementById('save-status');
      el.className = 'save-status ' + (success ? 'success' : 'error');
      el.textContent = message;
      setTimeout(() => { el.className = 'save-status'; }, 3000);
    }

    async function addImeiToWhitelist() {
      const input = document.getElementById('new-imei');
      const imei = input.value.trim();
      if (!imei || imei.length !== 15) {
        alert('Please enter a valid 15-digit IMEI');
        return;
      }
      try {
        await fetch('/api/security/whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imei })
        });
        input.value = '';
        loadSecurityConfig();
      } catch (e) {
        alert('Failed to add IMEI');
      }
    }

    async function removeImeiFromWhitelist(imei) {
      try {
        await fetch('/api/security/whitelist/' + imei, { method: 'DELETE' });
        loadSecurityConfig();
      } catch (e) {
        alert('Failed to remove IMEI');
      }
    }

    function addIpToWhitelist() {
      const input = document.getElementById('new-ip-whitelist');
      const ip = input.value.trim();
      if (!ip) return;
      securityConfig.ipWhitelist = securityConfig.ipWhitelist || [];
      if (!securityConfig.ipWhitelist.includes(ip)) {
        securityConfig.ipWhitelist.push(ip);
        renderIpWhitelist(securityConfig.ipWhitelist);
        input.value = '';
      }
    }

    function removeIpFromWhitelist(ip) {
      securityConfig.ipWhitelist = (securityConfig.ipWhitelist || []).filter(i => i !== ip);
      renderIpWhitelist(securityConfig.ipWhitelist);
    }

    async function blockIp() {
      const input = document.getElementById('new-blocked-ip');
      const ip = input.value.trim();
      if (!ip) return;
      try {
        await fetch('/api/security/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, duration: 3600000 })
        });
        input.value = '';
        loadSecurityConfig();
      } catch (e) {
        alert('Failed to block IP');
      }
    }

    async function unblockIp(ip) {
      try {
        await fetch('/api/security/block/' + encodeURIComponent(ip), { method: 'DELETE' });
        loadSecurityConfig();
      } catch (e) {
        alert('Failed to unblock IP');
      }
    }

    function copyApiKey() {
      const input = document.getElementById('cfg-apiKey');
      navigator.clipboard.writeText(input.value);
      alert('API Key copied to clipboard');
    }

    async function regenerateApiKey() {
      if (!confirm('Are you sure you want to regenerate the API key? This will invalidate the current key.')) return;
      try {
        const res = await fetch('/api/security/config/regenerate-key', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          document.getElementById('cfg-apiKey').value = data.apiKey;
          alert('New API Key generated. Please save it securely!');
        }
      } catch (e) {
        alert('Failed to regenerate API key');
      }
    }

    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'security') loadSecurityConfig();
      });
    });

    function handleMessage(msg) {
      switch (msg.type) {
        case 'init':
          msg.data.devices.forEach(d => devices[d.imei] = d);
          updateStats(msg.data.stats);
          renderDevices();
          msg.data.logs.reverse().forEach(log => addLog(log));
          break;
        case 'deviceConnected':
        case 'positionUpdate':
          devices[msg.data.imei] = msg.data;
          renderDevices();
          if (selectedImei === msg.data.imei) renderDeviceDetails(msg.data);
          break;
        case 'deviceDisconnected':
          if (devices[msg.data.imei]) devices[msg.data.imei].status = 'offline';
          renderDevices();
          break;
        case 'commandResponse':
          if (selectedImei === msg.data.imei) {
            const device = devices[msg.data.imei];
            if (device) renderCommandHistory(device.commandHistory);
          }
          break;
        case 'stats':
          updateStats(msg.data);
          break;
        case 'log':
          addLog(msg.data);
          break;
        case 'logsCleared':
          document.getElementById('logs-container').innerHTML = '';
          break;
      }
    }

    function updateStats(stats) {
      document.getElementById('stat-online').textContent = stats.onlineDevices;
      document.getElementById('stat-total').textContent = stats.totalDevices;
      document.getElementById('stat-messages').textContent = stats.totalMessages;
    }

    function renderDevices() {
      const list = document.getElementById('device-list');
      const deviceArray = Object.values(devices);
      
      if (deviceArray.length === 0) {
        list.innerHTML = '<div class="no-device">No devices connected</div>';
        return;
      }

      list.innerHTML = deviceArray.map(d => \`
        <div class="device \${selectedImei === d.imei ? 'selected' : ''}" onclick="selectDevice('\${d.imei}')">
          <div class="device-header">
            <span class="device-imei">\${d.imei}</span>
            <span class="device-status \${d.status}">\${d.status}</span>
          </div>
          <div class="device-info">
            Messages: \${d.messageCount} | Last seen: \${new Date(d.lastSeen).toLocaleTimeString()}
          </div>
          \${d.lastPosition ? \`
            <div class="device-position">
              <span>📍 \${d.lastPosition.lat.toFixed(5)}, \${d.lastPosition.lng.toFixed(5)}</span>
              <span>🚗 \${d.lastPosition.speed} km/h</span>
              <span>🛰️ \${d.lastPosition.satellites} sats</span>
            </div>
          \` : ''}
        </div>
      \`).join('');
    }

    function selectDevice(imei) {
      selectedImei = imei;
      renderDevices();
      const device = devices[imei];
      if (device) {
        renderDeviceDetails(device);
        document.getElementById('command-panel').style.display = 'block';
      }
    }

    function renderDeviceDetails(device) {
      const details = document.getElementById('device-details');
      details.innerHTML = \`
        <div style="background: #0f3460; padding: 15px; border-radius: 8px;">
          <h3 style="color: #00d9ff; margin-bottom: 10px;">IMEI: \${device.imei}</h3>
          <p>UUID: \${device.uuid}</p>
          <p>Status: <span class="device-status \${device.status}">\${device.status}</span></p>
          <p>Connected: \${new Date(device.connectedAt).toLocaleString()}</p>
          <p>Last seen: \${new Date(device.lastSeen).toLocaleString()}</p>
          <p>Messages received: \${device.messageCount}</p>
          \${device.lastPosition ? \`
            <h4 style="color: #00d9ff; margin-top: 15px;">Last Position</h4>
            <p>Coordinates: \${device.lastPosition.lat.toFixed(6)}, \${device.lastPosition.lng.toFixed(6)}</p>
            <p>Speed: \${device.lastPosition.speed} km/h | Altitude: \${device.lastPosition.altitude}m</p>
            <p>Angle: \${device.lastPosition.angle}° | Satellites: \${device.lastPosition.satellites}</p>
            <p>Time: \${new Date(device.lastPosition.timestamp).toLocaleString()}</p>
          \` : '<p style="color: #666;">No position data yet</p>'}
        </div>
      \`;
      renderCommandHistory(device.commandHistory);
    }

    function renderCommandHistory(history) {
      const container = document.getElementById('command-history');
      if (!history || history.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No commands sent yet</p>';
        return;
      }
      container.innerHTML = history.slice(0, 10).map(cmd => \`
        <div class="cmd-entry">
          <div class="cmd">› \${cmd.command}</div>
          \${cmd.response ? \`<div class="response">← \${cmd.response}</div>\` : ''}
          \${cmd.error ? \`<div class="error">✗ \${cmd.error}</div>\` : ''}
          <div class="time">\${new Date(cmd.sentAt).toLocaleTimeString()} - \${cmd.status}</div>
        </div>
      \`).join('');
    }

    function sendCommand() {
      if (!selectedImei) return;
      const input = document.getElementById('command-input');
      const command = input.value.trim();
      if (!command) return;
      
      ws.send(JSON.stringify({ type: 'sendCommand', imei: selectedImei, command }));
      input.value = '';
      
      // Optimistic update
      const device = devices[selectedImei];
      if (device) {
        device.commandHistory = device.commandHistory || [];
        device.commandHistory.unshift({ command, sentAt: new Date(), status: 'pending' });
        renderCommandHistory(device.commandHistory);
      }
    }

    function addLog(log) {
      if (logFilter !== 'all' && log.level !== logFilter) return;
      
      const container = document.getElementById('logs-container');
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = \`
        <span class="time">\${new Date(log.timestamp).toLocaleTimeString()}</span>
        <span class="level \${log.level}">\${log.level.toUpperCase()}</span>
        <span class="source">[\${log.source}]</span>
        <span class="message">\${log.message}</span>
      \`;
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;
    }

    // Event listeners
    document.getElementById('send-command').addEventListener('click', sendCommand);
    document.getElementById('command-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendCommand();
    });

    document.querySelectorAll('.quick-commands button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('command-input').value = btn.dataset.cmd;
        sendCommand();
      });
    });

    document.querySelectorAll('.logs-filter button[data-level]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.logs-filter button[data-level]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        logFilter = btn.dataset.level;
        document.getElementById('logs-container').innerHTML = '';
        ws.send(JSON.stringify({ type: 'getLogs', limit: 100, level: logFilter === 'all' ? undefined : logFilter }));
      });
    });

    document.getElementById('clear-logs').addEventListener('click', () => {
      ws.send(JSON.stringify({ type: 'clearLogs' }));
    });

    // Start connection
    connect();
  </script>
</body>
</html>`;
  }
}
