/**
 * Web API Server - REST API, WebSocket, and Static File Server
 * Features: JWT Auth, MQTT Config, Real-time updates
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { deviceManager, DeviceInfo, LogEntry } from './DeviceManager';
import { commandManager } from './CommandManager';
import { securityManager } from './SecurityManager';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

export interface ApiConfig {
  port: number;
  host: string;
}

export interface MqttConfig {
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  rejectUnauthorized: boolean;
  realm: string;
  keyword: string;
}

interface MqttStatus {
  connected: boolean;
  broker: string;
  messagesPublished: number;
  lastConnected?: Date;
  lastError?: string;
}

interface AuthenticatedWsClient {
  ws: WebSocket;
  authenticated: boolean;
  ip: string;
  userId?: string;
}

// Callback type for MQTT config updates
type MqttConfigCallback = (config: MqttConfig) => Promise<boolean>;

export class WebApiServer {
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: ApiConfig;
  private wsClients: Map<WebSocket, AuthenticatedWsClient> = new Map();
  
  private readonly jwtSecret: string;
  private readonly adminUser: string;
  private readonly adminPass: string;
  
  private mqttConfig: MqttConfig;
  private mqttStatus: MqttStatus;
  private onMqttConfigChange?: MqttConfigCallback;

  constructor(config: ApiConfig) {
    this.config = config;
    this.httpServer = createServer(this.handleRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.jwtSecret = process.env.JWT_SECRET || randomUUID();
    this.adminUser = process.env.ADMIN_USER || 'admin';
    this.adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    
    // Initialize MQTT config from ENV
    this.mqttConfig = {
      protocol: process.env.mqttOptions__protocol || 'mqtt',
      host: process.env.mqttOptions__host || 'localhost',
      port: parseInt(process.env.mqttOptions__port || '1883'),
      username: process.env.mqttOptions__username,
      password: process.env.mqttOptions__password,
      rejectUnauthorized: process.env.mqttOptions__rejectUnauthorized !== 'false',
      realm: process.env.orOpts__realm || 'master',
      keyword: process.env.orOpts__teltonika_keyword || 'teltonika'
    };
    
    this.mqttStatus = {
      connected: false,
      broker: `${this.mqttConfig.protocol}://${this.mqttConfig.host}:${this.mqttConfig.port}`,
      messagesPublished: 0
    };
    
    this.setupWebSocket();
    this.setupDeviceEvents();
  }

  /**
   * Set callback for MQTT config changes
   */
  setMqttConfigCallback(callback: MqttConfigCallback): void {
    this.onMqttConfigChange = callback;
  }

  /**
   * Update MQTT status (called from main app)
   */
  updateMqttStatus(status: Partial<MqttStatus>): void {
    this.mqttStatus = { ...this.mqttStatus, ...status };
    this.broadcastAuthenticated({ type: 'mqttStatus', data: this.mqttStatus });
  }

  /**
   * Increment messages published counter
   */
  incrementMqttMessages(): void {
    this.mqttStatus.messagesPublished++;
  }

  start(): void {
    this.httpServer.listen(this.config.port, this.config.host, () => {
      deviceManager.log('info', 'WebAPI', `Web interface running at http://${this.config.host}:${this.config.port}`);
      if (this.adminUser !== 'admin' || this.adminPass !== 'admin123') {
        deviceManager.log('info', 'WebAPI', `Login enabled for user: ${this.adminUser}`);
      } else {
        deviceManager.log('warn', 'WebAPI', 'Using default credentials! Set ADMIN_USER and ADMIN_PASSWORD in ENV');
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const clientIp = this.getClientIp(req);
      this.wsClients.set(ws, { ws, authenticated: false, ip: clientIp });

      ws.on('message', async (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleWsMessage(ws, msg);
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(ws);
      });
    });
  }

  private async handleWsMessage(ws: WebSocket, msg: any): Promise<void> {
    const client = this.wsClients.get(ws);
    if (!client) return;

    if (msg.type === 'auth') {
      try {
        const decoded = jwt.verify(msg.token, this.jwtSecret) as any;
        client.authenticated = true;
        client.userId = decoded.user;
        
        ws.send(JSON.stringify({ type: 'authSuccess', user: decoded.user }));
        ws.send(JSON.stringify({
          type: 'init',
          data: {
            devices: deviceManager.getAllDevices(),
            stats: deviceManager.getStats(),
            logs: deviceManager.getLogs(50)
          }
        }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'authError', message: 'Invalid token' }));
      }
      return;
    }

    if (!client.authenticated) {
      ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
      return;
    }

    switch (msg.type) {
      case 'sendCommand':
        await this.handleSendCommand(ws, msg);
        break;
        
      case 'addToWhitelist':
        securityManager.addImeiToWhitelist(msg.imei);
        this.broadcastAuthenticated({ type: 'whitelistUpdated', whitelist: securityManager.getImeiWhitelist() });
        break;
        
      case 'removeFromWhitelist':
        securityManager.removeImeiFromWhitelist(msg.imei);
        this.broadcastAuthenticated({ type: 'whitelistUpdated', whitelist: securityManager.getImeiWhitelist() });
        break;
        
      case 'getLogs':
        ws.send(JSON.stringify({ type: 'logs', data: deviceManager.getLogs(msg.limit || 100, msg.level) }));
        break;
        
      case 'clearLogs':
        deviceManager.clearLogs();
        this.broadcastAuthenticated({ type: 'logsCleared' });
        break;
        
      case 'getSecurityConfig':
        ws.send(JSON.stringify({ type: 'securityConfigUpdated', data: this.getSafeSecurityConfig() }));
        break;
        
      case 'updateSecurityConfig':
        securityManager.updateConfig(msg.config);
        this.broadcastAuthenticated({ type: 'securityConfigUpdated', data: this.getSafeSecurityConfig() });
        break;
        
      case 'regenerateApiKey':
        securityManager.regenerateApiKey();
        this.broadcastAuthenticated({ type: 'securityConfigUpdated', data: this.getSafeSecurityConfig() });
        break;
        
      case 'clearBlockedIps':
        securityManager.clearBlockedIps();
        this.broadcastAuthenticated({ type: 'securityConfigUpdated', data: this.getSafeSecurityConfig() });
        break;
        
      case 'unblockIp':
        securityManager.unblockIp(msg.ip);
        this.broadcastAuthenticated({ type: 'securityConfigUpdated', data: this.getSafeSecurityConfig() });
        break;
        
      case 'getMqttStatus':
        ws.send(JSON.stringify({ type: 'mqttStatus', data: this.mqttStatus }));
        break;
        
      case 'mqttReconnect':
        if (this.onMqttConfigChange) {
          await this.onMqttConfigChange(this.mqttConfig);
        }
        break;
    }
  }

  private async handleSendCommand(ws: WebSocket, msg: any): Promise<void> {
    const { imei, command, commandId } = msg;
    
    if (!imei || !command) {
      ws.send(JSON.stringify({ type: 'commandError', commandId, error: 'IMEI and command required' }));
      return;
    }

    ws.send(JSON.stringify({ type: 'commandPending', commandId, imei, command }));

    try {
      const cmdEntry = deviceManager.addCommand(imei, commandId || Date.now().toString(), command);
      const response = await commandManager.sendCommand(imei, command);
      
      if (cmdEntry) {
        deviceManager.updateCommandResponse(imei, cmdEntry.id, response.response || '', response.success, response.error);
      }
      
      ws.send(JSON.stringify({
        type: 'commandResponse', commandId, imei, command,
        success: response.success, response: response.response, error: response.error
      }));

      this.broadcastAuthenticated({
        type: 'deviceCommandResponse', imei, command,
        response: response.response, success: response.success
      });
    } catch (error: any) {
      ws.send(JSON.stringify({ type: 'commandError', commandId, imei, command, error: error.message }));
    }
  }

  private getSafeSecurityConfig(): any {
    const config = securityManager.getFullConfig();
    return { 
      ...config, 
      apiKey: config.apiKeyEnabled ? (config.apiKey || '').substring(0, 8) + '...' : '',
      blockedIps: Array.from(config.blockedIps || [])
    };
  }

  private setupDeviceEvents(): void {
    deviceManager.on('deviceConnected', (device: DeviceInfo) => {
      this.broadcastAuthenticated({ type: 'deviceConnected', data: device });
    });

    deviceManager.on('deviceDisconnected', (imei: string) => {
      this.broadcastAuthenticated({ type: 'deviceDisconnected', data: { imei } });
    });

    deviceManager.on('positionUpdate', (device: DeviceInfo) => {
      this.broadcastAuthenticated({ type: 'positionUpdate', data: device });
    });

    deviceManager.on('log', (log: LogEntry) => {
      this.broadcastAuthenticated({ type: 'log', data: log });
    });

    setInterval(() => {
      this.broadcastAuthenticated({ type: 'stats', data: deviceManager.getStats() });
    }, 5000);
  }

  private broadcastAuthenticated(msg: any): void {
    const data = JSON.stringify(msg);
    this.wsClients.forEach(client => {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  private getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await this.handleApiRequest(req, res, url);
      return;
    }

    this.serveStaticFile(req, res, url);
  }

  private async handleApiRequest(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const sendJson = (data: any, status: number = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      // Public endpoints
      if (url.pathname === '/api/health') {
        sendJson({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
        return;
      }

      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { username, password } = JSON.parse(body);
        
        if (username === this.adminUser && password === this.adminPass) {
          const token = jwt.sign({ user: username }, this.jwtSecret, { expiresIn: '24h' });
          sendJson({ success: true, token, user: username });
        } else {
          sendJson({ success: false, error: 'Invalid credentials' }, 401);
        }
        return;
      }

      if (url.pathname === '/api/auth/verify') {
        const authResult = this.verifyToken(req);
        if (authResult.valid) {
          sendJson({ success: true, user: authResult.user });
        } else {
          sendJson({ success: false, error: authResult.error }, 401);
        }
        return;
      }

      // Protected endpoints
      const authResult = this.verifyToken(req);
      if (!authResult.valid) {
        sendJson({ success: false, error: authResult.error }, 401);
        return;
      }

      // Stats
      if (url.pathname === '/api/stats') {
        sendJson({ success: true, stats: deviceManager.getStats() });
        return;
      }

      // Devices
      if (url.pathname === '/api/devices') {
        sendJson({ success: true, devices: deviceManager.getAllDevices() });
        return;
      }

      // MQTT Config
      if (url.pathname === '/api/mqtt/config') {
        if (req.method === 'GET') {
          sendJson({ 
            success: true, 
            config: {
              ...this.mqttConfig,
              password: this.mqttConfig.password ? '********' : ''
            }
          });
        } else if (req.method === 'POST') {
          const body = await this.readBody(req);
          const newConfig = JSON.parse(body);
          
          // Update config
          this.mqttConfig = {
            protocol: newConfig.protocol || this.mqttConfig.protocol,
            host: newConfig.host || this.mqttConfig.host,
            port: newConfig.port || this.mqttConfig.port,
            username: newConfig.username || undefined,
            password: newConfig.password || this.mqttConfig.password,
            rejectUnauthorized: newConfig.rejectUnauthorized ?? this.mqttConfig.rejectUnauthorized,
            realm: newConfig.realm || this.mqttConfig.realm,
            keyword: newConfig.keyword || this.mqttConfig.keyword
          };
          
          this.mqttStatus.broker = `${this.mqttConfig.protocol}://${this.mqttConfig.host}:${this.mqttConfig.port}`;
          
          // Notify main app to reconnect
          if (this.onMqttConfigChange) {
            const success = await this.onMqttConfigChange(this.mqttConfig);
            sendJson({ success, message: success ? 'Configuration applied' : 'Failed to apply' });
          } else {
            sendJson({ success: true, message: 'Configuration saved (reconnect manually)' });
          }
          
          this.broadcastAuthenticated({ type: 'mqttConfigUpdated', data: { success: true } });
        }
        return;
      }

      // MQTT Test
      if (url.pathname === '/api/mqtt/test' && req.method === 'POST') {
        const body = await this.readBody(req);
        const testConfig = JSON.parse(body);
        
        // TODO: Implement actual connection test
        sendJson({ success: true, message: 'Connection test not implemented yet' });
        return;
      }

      // Security whitelist
      if (url.pathname === '/api/security/whitelist') {
        if (req.method === 'GET') {
          sendJson({ success: true, whitelist: securityManager.getImeiWhitelist() });
        } else if (req.method === 'POST') {
          const body = await this.readBody(req);
          const { imei } = JSON.parse(body);
          securityManager.addImeiToWhitelist(imei);
          sendJson({ success: true });
        }
        return;
      }

      sendJson({ success: false, error: 'Not found' }, 404);
    } catch (error: any) {
      console.error('API Error:', error);
      sendJson({ success: false, error: 'Internal server error' }, 500);
    }
  }

  private verifyToken(req: IncomingMessage): { valid: boolean; user?: string; error?: string } {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return { valid: false, error: 'No token provided' };
    }
    
    try {
      const decoded = jwt.verify(authHeader.substring(7), this.jwtSecret) as any;
      return { valid: true, user: decoded.user };
    } catch (e) {
      return { valid: false, error: 'Invalid token' };
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private serveStaticFile(req: IncomingMessage, res: ServerResponse, url: URL): void {
    // Determine file path
    let filePath = url.pathname;
    if (filePath === '/') filePath = '/index.html';
    
    // Resolve to public directory
    const publicDir = path.join(__dirname, 'public');
    const fullPath = path.join(publicDir, filePath);
    
    // Security: prevent directory traversal
    if (!fullPath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Get file extension and content type
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Try to read and serve the file
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
        return;
      }

      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600'
      });
      res.end(data);
    });
  }
}
