/**
 * Web API Server - REST API, WebSocket, and Modern Web Dashboard
 * Features: JWT Auth, OpenStreetMap, Real-time updates, Command feedback
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { deviceManager, DeviceInfo, LogEntry } from './DeviceManager';
import { commandManager } from './CommandManager';
import { securityManager } from './SecurityManager';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface ApiConfig {
  port: number;
  host: string;
}

interface AuthenticatedWsClient {
  ws: WebSocket;
  authenticated: boolean;
  ip: string;
  userId?: string;
}

export class WebApiServer {
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private config: ApiConfig;
  private wsClients: Map<WebSocket, AuthenticatedWsClient> = new Map();
  
  private readonly jwtSecret: string;
  private readonly adminUser: string;
  private readonly adminPass: string;

  constructor(config: ApiConfig) {
    this.config = config;
    this.httpServer = createServer(this.handleRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.jwtSecret = process.env.JWT_SECRET || randomUUID();
    this.adminUser = process.env.ADMIN_USER || 'admin';
    this.adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    
    this.setupWebSocket();
    this.setupDeviceEvents();
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
        ws.send(JSON.stringify({ type: 'securityConfig', data: this.getSafeSecurityConfig() }));
        break;
      case 'updateSecurityConfig':
        securityManager.updateConfig(msg.config);
        this.broadcastAuthenticated({ type: 'securityConfigUpdated', data: this.getSafeSecurityConfig() });
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
      // Add to command history
      const cmdEntry = deviceManager.addCommand(imei, commandId || Date.now().toString(), command);
      
      const response = await commandManager.sendCommand(imei, command);
      
      // Update command history with response
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
    return { ...config, apiKey: config.apiKey ? '********' : '' };
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
      if (url.pathname === '/api/health') {
        sendJson({ success: true, status: 'healthy' });
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

      const authResult = this.verifyToken(req);
      if (!authResult.valid) {
        sendJson({ success: false, error: authResult.error }, 401);
        return;
      }

      if (url.pathname === '/api/stats') {
        sendJson({ success: true, stats: deviceManager.getStats() });
        return;
      }

      if (url.pathname === '/api/devices') {
        sendJson({ success: true, devices: deviceManager.getAllDevices() });
        return;
      }

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
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getIndexHtml());
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  }

  private getIndexHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Teltonika Device Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    .loader { border: 3px solid #1e293b; border-top: 3px solid #06b6d4; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    #map { height: 400px; border-radius: 0.5rem; }
    .device-marker { background: #06b6d4; border: 3px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .device-marker.offline { background: #ef4444; }
  </style>
</head>
<body class="bg-slate-900 text-white min-h-screen">
  <!-- Login -->
  <div id="login-screen" class="min-h-screen flex items-center justify-center">
    <div class="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
      <h1 class="text-3xl font-bold text-cyan-400 text-center mb-8">🛰️ Teltonika Manager</h1>
      <form id="login-form" class="space-y-4">
        <input type="text" id="login-user" class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg" placeholder="Username" required>
        <input type="password" id="login-pass" class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg" placeholder="Password" required>
        <div id="login-error" class="text-red-400 text-sm hidden"></div>
        <button type="submit" class="w-full py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold">Sign In</button>
      </form>
    </div>
  </div>

  <!-- Dashboard -->
  <div id="dashboard" class="hidden">
    <header class="bg-slate-800 border-b border-slate-700 px-6 py-4">
      <div class="max-w-7xl mx-auto flex justify-between items-center">
        <h1 class="text-2xl font-bold text-cyan-400">🛰️ Teltonika Manager</h1>
        <div class="flex items-center gap-6">
          <div class="flex gap-4">
            <div class="text-center"><div id="stat-online" class="text-xl font-bold text-green-400">0</div><div class="text-xs text-slate-400">Online</div></div>
            <div class="text-center"><div id="stat-total" class="text-xl font-bold text-cyan-400">0</div><div class="text-xs text-slate-400">Total</div></div>
            <div class="text-center"><div id="stat-messages" class="text-xl font-bold text-purple-400">0</div><div class="text-xs text-slate-400">Messages</div></div>
          </div>
          <div class="flex items-center gap-2">
            <div id="ws-indicator" class="w-3 h-3 rounded-full bg-red-500"></div>
            <span id="ws-status" class="text-sm text-slate-400">Connecting...</span>
          </div>
          <button id="logout-btn" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Logout</button>
        </div>
      </div>
    </header>

    <nav class="bg-slate-800 border-b border-slate-700">
      <div class="max-w-7xl mx-auto px-6 flex gap-1">
        <button class="tab-btn active px-6 py-3 text-sm font-medium border-b-2 border-cyan-400 text-cyan-400" data-tab="map">📍 Map</button>
        <button class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-slate-400" data-tab="devices">📱 Devices</button>
        <button class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-slate-400" data-tab="security">🔒 Security</button>
        <button class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-slate-400" data-tab="logs">📋 Logs</button>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto p-6">
      <!-- Map Tab -->
      <div id="tab-map" class="tab-content">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-slate-800 rounded-xl p-4">
            <h2 class="text-lg font-semibold mb-4">📍 Device Locations</h2>
            <div id="map"></div>
          </div>
          <div class="bg-slate-800 rounded-xl p-4">
            <h2 class="text-lg font-semibold mb-4">📱 Online Devices</h2>
            <div id="map-device-list" class="space-y-2 max-h-96 overflow-y-auto"></div>
          </div>
        </div>
      </div>

      <!-- Devices Tab -->
      <div id="tab-devices" class="tab-content hidden">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-slate-800 rounded-xl p-4">
            <h2 class="text-lg font-semibold mb-4">📱 Connected Devices</h2>
            <div id="device-list" class="space-y-2 max-h-[500px] overflow-y-auto"></div>
          </div>
          <div class="bg-slate-800 rounded-xl p-4">
            <h2 class="text-lg font-semibold mb-4">📝 Device Details</h2>
            <div id="device-details" class="text-slate-400 text-center py-8">Select a device</div>
            <div id="command-section" class="hidden mt-6 border-t border-slate-700 pt-4">
              <h3 class="text-md font-semibold mb-3">💬 Send Command</h3>
              <div class="flex gap-2 mb-3">
                <input type="text" id="cmd-input" class="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg" placeholder="Enter command...">
                <button id="cmd-send" class="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium">Send <span id="cmd-loader" class="loader hidden ml-2"></span></button>
              </div>
              <div class="flex flex-wrap gap-2 mb-4">
                <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm" data-cmd="getinfo">getinfo</button>
                <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm" data-cmd="getver">getver</button>
                <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm" data-cmd="getstatus">getstatus</button>
                <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm" data-cmd="getgps">getgps</button>
              </div>
              <div id="cmd-history" class="space-y-2 max-h-48 overflow-y-auto"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Security Tab -->
      <div id="tab-security" class="tab-content hidden">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-slate-800 rounded-xl p-4">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-semibold">📋 IMEI Whitelist</h2>
              <label class="flex items-center gap-2 cursor-pointer">
                <span class="text-sm text-slate-400">Enabled</span>
                <input type="checkbox" id="whitelist-enabled" class="sr-only peer">
                <div class="relative w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>
            <div class="mb-4">
              <h3 class="text-sm font-medium text-slate-300 mb-2">Add from connected:</h3>
              <div id="connected-devices-whitelist" class="flex flex-wrap gap-2"></div>
            </div>
            <div id="whitelist-items" class="space-y-2 max-h-64 overflow-y-auto mb-4"></div>
            <div class="flex gap-2">
              <input type="text" id="new-imei" class="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm" placeholder="Enter IMEI">
              <button id="add-imei-btn" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm">Add</button>
            </div>
          </div>
          <div class="bg-slate-800 rounded-xl p-4">
            <h2 class="text-lg font-semibold mb-4">⚙️ Settings</h2>
            <div class="space-y-4">
              <div class="flex justify-between items-center py-2 border-b border-slate-700">
                <div><div class="font-medium">Rate Limiting</div><div class="text-sm text-slate-400">Limit requests per IP</div></div>
                <label class="cursor-pointer"><input type="checkbox" id="rate-limit-enabled" class="sr-only peer"><div class="relative w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div></label>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-slate-700">
                <div><div class="font-medium">Max Devices/IP</div></div>
                <input type="number" id="max-devices-ip" class="w-20 px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-center" value="5">
              </div>
              <div class="flex justify-between items-center py-2">
                <div><div class="font-medium">Max Connection Attempts</div></div>
                <input type="number" id="max-conn-attempts" class="w-20 px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-center" value="10">
              </div>
            </div>
            <button id="save-security" class="w-full mt-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium">Save Settings</button>
          </div>
        </div>
      </div>

      <!-- Logs Tab -->
      <div id="tab-logs" class="tab-content hidden">
        <div class="bg-slate-800 rounded-xl p-4">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-semibold">📋 System Logs</h2>
            <div class="flex gap-2">
              <button class="log-filter active px-3 py-1 bg-cyan-600 rounded text-sm" data-level="all">All</button>
              <button class="log-filter px-3 py-1 bg-slate-700 rounded text-sm" data-level="info">Info</button>
              <button class="log-filter px-3 py-1 bg-slate-700 rounded text-sm" data-level="warn">Warn</button>
              <button class="log-filter px-3 py-1 bg-slate-700 rounded text-sm" data-level="error">Error</button>
              <button id="clear-logs" class="px-3 py-1 bg-red-600 rounded text-sm">Clear</button>
            </div>
          </div>
          <div id="logs-container" class="font-mono text-sm bg-slate-900 rounded-lg p-4 h-[500px] overflow-y-auto"></div>
        </div>
      </div>
    </main>
  </div>

  <!-- Toasts -->
  <div id="toasts" class="fixed bottom-4 right-4 space-y-2 z-50"></div>

  <script>
    let token = localStorage.getItem('token');
    let ws = null;
    let devices = {};
    let selectedImei = null;
    let map = null;
    let markers = {};
    let logFilter = 'all';
    let securityConfig = {};
    let pendingCommand = null;

    if (token) verifyToken();

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = document.getElementById('login-user').value;
      const pass = document.getElementById('login-pass').value;
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        
        if (data.success) {
          token = data.token;
          localStorage.setItem('token', token);
          showDashboard();
        } else {
          document.getElementById('login-error').textContent = data.error;
          document.getElementById('login-error').classList.remove('hidden');
        }
      } catch (e) {
        document.getElementById('login-error').textContent = 'Connection error';
        document.getElementById('login-error').classList.remove('hidden');
      }
    });

    async function verifyToken() {
      try {
        const res = await fetch('/api/auth/verify', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if (data.success) showDashboard();
        else logout();
      } catch (e) { logout(); }
    }

    function showDashboard() {
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      initMap();
      connectWebSocket();
    }

    function logout() {
      token = null;
      localStorage.removeItem('token');
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('dashboard').classList.add('hidden');
      if (ws) ws.close();
    }

    document.getElementById('logout-btn').addEventListener('click', logout);

    function initMap() {
      if (map) return;
      map = L.map('map').setView([-12.0464, -77.0428], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
    }

    function connectWebSocket() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(wsProtocol + '//' + window.location.host);
      
      ws.onopen = () => {
        document.getElementById('ws-indicator').className = 'w-3 h-3 rounded-full bg-yellow-500';
        document.getElementById('ws-status').textContent = 'Authenticating...';
        ws.send(JSON.stringify({ type: 'auth', token }));
      };
      
      ws.onclose = () => {
        document.getElementById('ws-indicator').className = 'w-3 h-3 rounded-full bg-red-500';
        document.getElementById('ws-status').textContent = 'Disconnected';
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onmessage = (e) => handleWsMessage(JSON.parse(e.data));
    }

    function handleWsMessage(msg) {
      switch (msg.type) {
        case 'authSuccess':
          document.getElementById('ws-indicator').className = 'w-3 h-3 rounded-full bg-green-500';
          document.getElementById('ws-status').textContent = 'Connected';
          break;
        case 'authError': logout(); break;
        case 'init':
          msg.data.devices.forEach(d => { devices[d.imei] = d; updateMarker(d); });
          updateStats(msg.data.stats);
          renderDevices();
          msg.data.logs.forEach(addLog);
          break;
        case 'deviceConnected':
        case 'positionUpdate':
          devices[msg.data.imei] = msg.data;
          updateMarker(msg.data);
          renderDevices();
          if (selectedImei === msg.data.imei) renderDetails(msg.data);
          break;
        case 'deviceDisconnected':
          if (devices[msg.data.imei]) { devices[msg.data.imei].status = 'offline'; updateMarker(devices[msg.data.imei]); }
          renderDevices();
          break;
        case 'commandResponse': handleCommandResponse(msg); break;
        case 'commandError': handleCommandError(msg); break;
        case 'stats': updateStats(msg.data); break;
        case 'log': addLog(msg.data); break;
        case 'logsCleared': document.getElementById('logs-container').innerHTML = ''; break;
        case 'whitelistUpdated': renderWhitelist(msg.whitelist); break;
        case 'securityConfigUpdated': securityConfig = msg.data; renderSecurityConfig(); break;
      }
    }

    function updateMarker(device) {
      if (!device.lastPosition?.lat) return;
      const { lat, lng } = device.lastPosition;
      
      const icon = L.divIcon({ className: 'device-marker ' + (device.status === 'offline' ? 'offline' : ''), iconSize: [16, 16], iconAnchor: [8, 8] });
      
      if (markers[device.imei]) {
        markers[device.imei].setLatLng([lat, lng]).setIcon(icon);
      } else {
        markers[device.imei] = L.marker([lat, lng], { icon }).addTo(map);
      }
      
      markers[device.imei].bindPopup(\`<b>\${device.imei}</b><br>Speed: \${device.lastPosition.speed} km/h<br>Sats: \${device.lastPosition.satellites}\`);
    }

    function updateStats(stats) {
      document.getElementById('stat-online').textContent = stats.onlineDevices;
      document.getElementById('stat-total').textContent = stats.totalDevices;
      document.getElementById('stat-messages').textContent = stats.totalMessages;
    }

    function renderDevices() {
      const arr = Object.values(devices);
      document.getElementById('device-list').innerHTML = arr.length === 0 ? '<div class="text-slate-400 text-center py-8">No devices</div>' :
        arr.map(d => \`<div class="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer \${selectedImei === d.imei ? 'ring-2 ring-cyan-400' : ''}" onclick="selectDevice('\${d.imei}')">
          <div class="flex justify-between"><span class="font-mono">\${d.imei}</span><span class="px-2 py-1 rounded text-xs \${d.status === 'online' ? 'bg-green-600' : 'bg-red-600'}">\${d.status}</span></div>
          \${d.lastPosition ? \`<div class="text-xs text-slate-400 mt-1">📍 \${d.lastPosition.lat?.toFixed(5)}, \${d.lastPosition.lng?.toFixed(5)} | 🚗 \${d.lastPosition.speed} km/h</div>\` : ''}
        </div>\`).join('');
      
      document.getElementById('map-device-list').innerHTML = arr.filter(d => d.status === 'online').map(d => \`<div class="p-2 bg-slate-700 rounded cursor-pointer hover:bg-slate-600 text-sm" onclick="focusDevice('\${d.imei}')"><div class="font-mono">\${d.imei}</div></div>\`).join('') || '<div class="text-slate-400 text-sm">No online devices</div>';
      
      renderConnectedForWhitelist();
    }

    function selectDevice(imei) {
      selectedImei = imei;
      renderDevices();
      renderDetails(devices[imei]);
      document.getElementById('command-section').classList.remove('hidden');
    }

    function focusDevice(imei) {
      const d = devices[imei];
      if (d?.lastPosition) { map.setView([d.lastPosition.lat, d.lastPosition.lng], 16); markers[imei]?.openPopup(); }
    }

    function renderDetails(d) {
      if (!d) return;
      const pos = d.lastPosition;
      document.getElementById('device-details').innerHTML = \`<div class="space-y-2 text-left">
        <div class="flex justify-between"><span class="text-slate-400">IMEI</span><span class="font-mono">\${d.imei}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Status</span><span class="px-2 py-1 rounded text-xs \${d.status === 'online' ? 'bg-green-600' : 'bg-red-600'}">\${d.status}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Messages</span><span>\${d.messageCount}</span></div>
        \${pos ? \`<div class="border-t border-slate-700 pt-2 mt-2"><div class="text-sm">📍 \${pos.lat?.toFixed(6)}, \${pos.lng?.toFixed(6)}</div><div class="text-sm">🚗 \${pos.speed} km/h | 📡 \${pos.satellites} sats</div></div>\` : ''}
      </div>\`;
      renderCmdHistory(d.commandHistory);
    }

    document.getElementById('cmd-send').addEventListener('click', sendCommand);
    document.getElementById('cmd-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendCommand(); });
    document.querySelectorAll('.quick-cmd').forEach(btn => btn.addEventListener('click', () => { document.getElementById('cmd-input').value = btn.dataset.cmd; sendCommand(); }));

    function sendCommand() {
      if (!selectedImei || pendingCommand) return;
      const input = document.getElementById('cmd-input');
      const command = input.value.trim();
      if (!command) return;
      
      pendingCommand = Date.now().toString();
      document.getElementById('cmd-loader').classList.remove('hidden');
      document.getElementById('cmd-send').disabled = true;
      
      ws.send(JSON.stringify({ type: 'sendCommand', imei: selectedImei, command, commandId: pendingCommand }));
      input.value = '';
      
      setTimeout(() => { if (pendingCommand) { pendingCommand = null; document.getElementById('cmd-loader').classList.add('hidden'); document.getElementById('cmd-send').disabled = false; showToast('Command timeout', 'error'); } }, 35000);
    }

    function handleCommandResponse(msg) {
      pendingCommand = null;
      document.getElementById('cmd-loader').classList.add('hidden');
      document.getElementById('cmd-send').disabled = false;
      showToast(msg.success ? 'Response: ' + (msg.response || 'OK') : 'Failed: ' + msg.error, msg.success ? 'success' : 'error');
      if (devices[msg.imei]) renderCmdHistory(devices[msg.imei].commandHistory);
    }

    function handleCommandError(msg) {
      pendingCommand = null;
      document.getElementById('cmd-loader').classList.add('hidden');
      document.getElementById('cmd-send').disabled = false;
      showToast('Error: ' + msg.error, 'error');
    }

    function renderCmdHistory(history) {
      document.getElementById('cmd-history').innerHTML = !history?.length ? '<div class="text-slate-400 text-sm text-center py-4">No commands</div>' :
        history.slice(0, 10).map(c => \`<div class="p-2 bg-slate-900 rounded text-sm"><div class="text-cyan-400">› \${c.command}</div>\${c.response ? \`<div class="text-green-400 mt-1">← \${c.response}</div>\` : ''}\${c.error ? \`<div class="text-red-400 mt-1">✗ \${c.error}</div>\` : ''}</div>\`).join('');
    }

    function renderConnectedForWhitelist() {
      const whitelist = securityConfig.imeiWhitelist || [];
      const online = Object.values(devices).filter(d => d.status === 'online' && !whitelist.includes(d.imei));
      document.getElementById('connected-devices-whitelist').innerHTML = online.length === 0 ? '<span class="text-slate-400 text-sm">All whitelisted</span>' :
        online.map(d => \`<button class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm" onclick="addToWhitelist('\${d.imei}')">+ \${d.imei}</button>\`).join('');
    }

    function renderWhitelist(whitelist) {
      securityConfig.imeiWhitelist = whitelist;
      document.getElementById('whitelist-items').innerHTML = whitelist.length === 0 ? '<div class="text-slate-400 text-sm text-center py-4">Empty</div>' :
        whitelist.map(imei => \`<div class="flex justify-between items-center p-2 bg-slate-700 rounded"><span class="font-mono text-sm">\${imei}</span><button class="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs" onclick="removeFromWhitelist('\${imei}')">Remove</button></div>\`).join('');
      renderConnectedForWhitelist();
    }

    function addToWhitelist(imei) { ws.send(JSON.stringify({ type: 'addToWhitelist', imei })); showToast('Added: ' + imei, 'success'); }
    function removeFromWhitelist(imei) { ws.send(JSON.stringify({ type: 'removeFromWhitelist', imei })); }

    document.getElementById('add-imei-btn').addEventListener('click', () => {
      const imei = document.getElementById('new-imei').value.trim();
      if (imei.length === 15) { addToWhitelist(imei); document.getElementById('new-imei').value = ''; }
      else showToast('IMEI must be 15 digits', 'error');
    });

    function renderSecurityConfig() {
      document.getElementById('whitelist-enabled').checked = securityConfig.imeiWhitelistEnabled;
      document.getElementById('rate-limit-enabled').checked = securityConfig.rateLimitEnabled;
      document.getElementById('max-devices-ip').value = securityConfig.maxDevicesPerIp || 5;
      document.getElementById('max-conn-attempts').value = securityConfig.maxConnectionAttempts || 10;
      renderWhitelist(securityConfig.imeiWhitelist || []);
    }

    document.getElementById('save-security').addEventListener('click', () => {
      ws.send(JSON.stringify({ type: 'updateSecurityConfig', config: {
        imeiWhitelistEnabled: document.getElementById('whitelist-enabled').checked,
        rateLimitEnabled: document.getElementById('rate-limit-enabled').checked,
        maxDevicesPerIp: parseInt(document.getElementById('max-devices-ip').value),
        maxConnectionAttempts: parseInt(document.getElementById('max-conn-attempts').value)
      }}));
      showToast('Settings saved', 'success');
    });

    function addLog(log) {
      if (logFilter !== 'all' && log.level !== logFilter) return;
      const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', debug: 'text-purple-400' };
      const container = document.getElementById('logs-container');
      const entry = document.createElement('div');
      entry.className = 'py-1 border-b border-slate-800';
      entry.innerHTML = \`<span class="text-slate-500">\${new Date(log.timestamp).toLocaleTimeString()}</span> <span class="\${colors[log.level] || ''} px-2">[\${log.level.toUpperCase()}]</span> <span class="text-cyan-400">[\${log.source}]</span> \${log.message}\`;
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;
    }

    document.querySelectorAll('.log-filter').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.log-filter').forEach(b => { b.classList.remove('active', 'bg-cyan-600'); b.classList.add('bg-slate-700'); });
      btn.classList.add('active', 'bg-cyan-600'); btn.classList.remove('bg-slate-700');
      logFilter = btn.dataset.level;
      document.getElementById('logs-container').innerHTML = '';
      ws.send(JSON.stringify({ type: 'getLogs', limit: 100, level: logFilter === 'all' ? undefined : logFilter }));
    }));

    document.getElementById('clear-logs').addEventListener('click', () => ws.send(JSON.stringify({ type: 'clearLogs' })));

    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active', 'border-cyan-400', 'text-cyan-400'); b.classList.add('border-transparent', 'text-slate-400'); });
      btn.classList.add('active', 'border-cyan-400', 'text-cyan-400'); btn.classList.remove('border-transparent', 'text-slate-400');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'map') setTimeout(() => map?.invalidateSize(), 100);
      if (btn.dataset.tab === 'security') ws.send(JSON.stringify({ type: 'getSecurityConfig' }));
    }));

    function showToast(message, type = 'info') {
      const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
      const toast = document.createElement('div');
      toast.className = \`px-4 py-3 rounded-lg shadow-lg \${colors[type]} text-white\`;
      toast.textContent = message;
      document.getElementById('toasts').appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    }
  </script>
</body>
</html>`;
  }
}
