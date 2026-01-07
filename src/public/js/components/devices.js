/**
 * Devices Component - Device list and command management
 */

const DevicesComponent = {
  container: null,
  selectedImei: null,
  pendingCommand: null,

  init() {
    this.container = document.getElementById('tab-devices');
    this.render();
    this.setupEventListeners();
  },

  render() {
    this.container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Device List -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4">📱 Connected Devices</h2>
          <div id="device-list" class="space-y-2 max-h-[500px] overflow-y-auto"></div>
        </div>
        
        <!-- Device Details -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4">📝 Device Details</h2>
          <div id="device-details" class="text-slate-400 text-center py-8">Select a device</div>
          
          <!-- Command Section -->
          <div id="command-section" class="hidden mt-6 border-t border-slate-700 pt-4">
            <h3 class="text-md font-semibold mb-3">💬 Send Command</h3>
            <div class="flex gap-2 mb-3">
              <input type="text" id="cmd-input" 
                     class="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" 
                     placeholder="Enter command...">
              <button id="cmd-send" class="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors flex items-center gap-2">
                Send
                <span id="cmd-loader" class="loader hidden"></span>
              </button>
            </div>
            
            <!-- Quick Commands -->
            <div class="flex flex-wrap gap-2 mb-4">
              <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-cmd="getinfo">getinfo</button>
              <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-cmd="getver">getver</button>
              <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-cmd="getstatus">getstatus</button>
              <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-cmd="getgps">getgps</button>
              <button class="quick-cmd px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-cmd="getio">getio</button>
            </div>
            
            <!-- Command History -->
            <div id="cmd-history" class="space-y-2 max-h-48 overflow-y-auto"></div>
          </div>
        </div>
      </div>
    `;
  },

  setupEventListeners() {
    document.getElementById('cmd-send').addEventListener('click', () => this.sendCommand());
    document.getElementById('cmd-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendCommand();
    });

    this.container.querySelectorAll('.quick-cmd').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('cmd-input').value = btn.dataset.cmd;
        this.sendCommand();
      });
    });
  },

  renderList(devices) {
    const container = document.getElementById('device-list');
    const deviceArray = Object.values(devices);
    
    if (deviceArray.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-center py-8">No devices connected</div>';
      return;
    }

    container.innerHTML = deviceArray.map(d => `
      <div class="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition-colors ${this.selectedImei === d.imei ? 'ring-2 ring-cyan-400' : ''}" 
           onclick="DevicesComponent.selectDevice('${d.imei}')">
        <div class="flex justify-between items-center">
          <span class="font-mono">${d.imei}</span>
          <span class="status-badge ${d.status}">${d.status}</span>
        </div>
        ${d.lastPosition ? `
          <div class="text-xs text-slate-400 mt-1">
            📍 ${d.lastPosition.lat?.toFixed(5)}, ${d.lastPosition.lng?.toFixed(5)} | 
            🚗 ${d.lastPosition.speed || 0} km/h
          </div>
        ` : ''}
        <div class="text-xs text-slate-500 mt-1">Messages: ${d.messageCount || 0}</div>
      </div>
    `).join('');
  },

  selectDevice(imei) {
    this.selectedImei = imei;
    this.renderList(App.devices);
    this.renderDetails(App.devices[imei]);
    document.getElementById('command-section').classList.remove('hidden');
  },

  renderDetails(device) {
    if (!device) return;
    
    const pos = device.lastPosition;
    document.getElementById('device-details').innerHTML = `
      <div class="space-y-3 text-left">
        <div class="flex justify-between items-center py-2 border-b border-slate-700">
          <span class="text-slate-400">IMEI</span>
          <span class="font-mono">${device.imei}</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-slate-700">
          <span class="text-slate-400">Status</span>
          <span class="status-badge ${device.status}">${device.status}</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-slate-700">
          <span class="text-slate-400">Messages</span>
          <span>${device.messageCount || 0}</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-slate-700">
          <span class="text-slate-400">Connected</span>
          <span class="text-sm">${device.connectedAt ? Utils.formatDateTime(device.connectedAt) : 'N/A'}</span>
        </div>
        ${pos ? `
          <div class="mt-4 p-3 bg-slate-800 rounded-lg">
            <div class="text-sm font-medium mb-2">Last Position</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>📍 ${pos.lat?.toFixed(6)}, ${pos.lng?.toFixed(6)}</div>
              <div>🚗 ${pos.speed || 0} km/h</div>
              <div>📡 ${pos.satellites || 0} satellites</div>
              <div>🧭 ${pos.angle || 0}°</div>
              ${pos.altitude ? `<div>⛰️ ${pos.altitude}m altitude</div>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    this.renderCommandHistory(device.commandHistory);
  },

  renderCommandHistory(history) {
    const container = document.getElementById('cmd-history');
    
    if (!history || history.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">No command history</div>';
      return;
    }

    container.innerHTML = history.slice(0, 10).map(c => `
      <div class="p-2 bg-slate-900 rounded text-sm">
        <div class="text-cyan-400">› ${Utils.escapeHtml(c.command)}</div>
        ${c.response ? `<div class="text-green-400 mt-1">← ${Utils.escapeHtml(c.response)}</div>` : ''}
        ${c.error ? `<div class="text-red-400 mt-1">✗ ${Utils.escapeHtml(c.error)}</div>` : ''}
        <div class="text-slate-500 text-xs mt-1">${Utils.formatTime(c.sentAt)}</div>
      </div>
    `).join('');
  },

  sendCommand() {
    if (!this.selectedImei || this.pendingCommand) return;
    
    const input = document.getElementById('cmd-input');
    const command = input.value.trim();
    if (!command) return;

    this.pendingCommand = Date.now().toString();
    document.getElementById('cmd-loader').classList.remove('hidden');
    document.getElementById('cmd-send').disabled = true;

    WS.send({
      type: 'sendCommand',
      imei: this.selectedImei,
      command,
      commandId: this.pendingCommand
    });

    input.value = '';

    // Timeout handling
    setTimeout(() => {
      if (this.pendingCommand) {
        this.pendingCommand = null;
        document.getElementById('cmd-loader').classList.add('hidden');
        document.getElementById('cmd-send').disabled = false;
        Utils.showToast('Command timeout', 'error');
      }
    }, 35000);
  },

  handleCommandPending(msg) {
    // Command is being processed
  },

  handleCommandResponse(msg) {
    this.pendingCommand = null;
    document.getElementById('cmd-loader').classList.add('hidden');
    document.getElementById('cmd-send').disabled = false;
    
    Utils.showToast(
      msg.success ? `Response: ${msg.response || 'OK'}` : `Failed: ${msg.error}`,
      msg.success ? 'success' : 'error'
    );
    
    // Refresh device details if it's the selected device
    if (msg.imei === this.selectedImei && App.devices[msg.imei]) {
      this.renderDetails(App.devices[msg.imei]);
    }
  },

  handleCommandError(msg) {
    this.pendingCommand = null;
    document.getElementById('cmd-loader').classList.add('hidden');
    document.getElementById('cmd-send').disabled = false;
    Utils.showToast(`Error: ${msg.error}`, 'error');
  }
};

window.DevicesComponent = DevicesComponent;
