/**
 * WebSocket Connection Manager
 */

const WS = {
  socket: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectDelay: 3000,

  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${wsProtocol}//${window.location.host}`);

    this.socket.onopen = () => {
      this.updateStatus('yellow', 'Authenticating...');
      this.reconnectAttempts = 0;
      this.authenticate();
    };

    this.socket.onclose = () => {
      this.updateStatus('red', 'Disconnected');
      this.scheduleReconnect();
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };
  },

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },

  authenticate() {
    this.send({ type: 'auth', token: Auth.getToken() });
  },

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  },

  updateStatus(color, text) {
    document.getElementById('ws-indicator').className = `w-3 h-3 rounded-full bg-${color}-500`;
    document.getElementById('ws-status').textContent = text;
  },

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && Auth.isAuthenticated()) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  },

  handleMessage(msg) {
    switch (msg.type) {
      case 'authSuccess':
        this.updateStatus('green', 'Connected');
        break;
        
      case 'authError':
        Auth.logout();
        break;
        
      case 'init':
        App.handleInit(msg.data);
        break;
        
      case 'deviceConnected':
      case 'positionUpdate':
        App.handleDeviceUpdate(msg.data);
        break;
        
      case 'deviceDisconnected':
        App.handleDeviceDisconnected(msg.data.imei);
        break;
        
      case 'commandPending':
        DevicesComponent.handleCommandPending(msg);
        break;
        
      case 'commandResponse':
        DevicesComponent.handleCommandResponse(msg);
        break;
        
      case 'commandError':
        DevicesComponent.handleCommandError(msg);
        break;
        
      case 'stats':
        App.updateStats(msg.data);
        break;
        
      case 'log':
        LogsComponent.addLog(msg.data);
        break;
        
      case 'logsCleared':
        LogsComponent.clear();
        break;
        
      case 'whitelistUpdated':
        SecurityComponent.renderWhitelist(msg.whitelist);
        break;
        
      case 'securityConfigUpdated':
        SecurityComponent.updateConfig(msg.data);
        break;
        
      case 'mqttStatus':
        MqttComponent.updateStatus(msg.data);
        break;
        
      case 'mqttConfigUpdated':
        MqttComponent.handleConfigUpdated(msg.data);
        break;
    }
  }
};

window.WS = WS;
