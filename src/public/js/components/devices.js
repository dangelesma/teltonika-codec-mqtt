/**
 * Devices Component - Device list and command management
 * Modern UI with search, filters and better layout
 */

const DevicesComponent = {
  container: null,
  selectedImei: null,
  pendingCommand: null,
  searchQuery: '',

  init() {
    this.container = document.getElementById('tab-devices');
    this.render();
    this.setupEventListeners();
  },

  render() {
    this.container.innerHTML = `
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- Device List Panel -->
        <div class="xl:col-span-1">
          <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <!-- Header with search -->
            <div class="p-4 border-b border-slate-700/50 bg-slate-800/50">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-lg font-bold flex items-center gap-2">
                  <span class="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center text-sm">📱</span>
                  Devices
                </h2>
                <span id="device-count" class="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm font-medium">0</span>
              </div>
              <!-- Search Box -->
              <div class="relative">
                <input type="text" id="device-search" 
                       class="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all placeholder-slate-500" 
                       placeholder="Search by IMEI..."
                       maxlength="15">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
            </div>
            <!-- Device List -->
            <div id="device-list" class="p-3 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar"></div>
          </div>
        </div>
        
        <!-- Device Details Panel -->
        <div class="xl:col-span-2">
          <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <!-- Header -->
            <div class="p-4 border-b border-slate-700/50 bg-slate-800/50">
              <h2 class="text-lg font-bold flex items-center gap-2">
                <span class="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center text-sm">📋</span>
                Device Details
              </h2>
            </div>
            
            <!-- Content -->
            <div class="p-4">
              <div id="device-details" class="text-slate-400 text-center py-12">
                <div class="w-16 h-16 mx-auto mb-4 bg-slate-700/50 rounded-2xl flex items-center justify-center">
                  <svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                  </svg>
                </div>
                <p class="text-sm">Select a device to view details</p>
              </div>
              
              <!-- Command Section -->
              <div id="command-section" class="hidden mt-6 pt-6 border-t border-slate-700/50">
                <h3 class="text-md font-semibold mb-4 flex items-center gap-2">
                  <span class="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-xs">⌨️</span>
                  Send Command
                </h3>
                
                <!-- Command Input -->
                <div class="flex gap-3 mb-4">
                  <div class="flex-1 relative">
                    <input type="text" id="cmd-input" 
                           class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all placeholder-slate-500" 
                           placeholder="Enter command (e.g., getinfo)">
                  </div>
                  <button id="cmd-send" class="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl font-medium transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <span>Send</span>
                    <span id="cmd-loader" class="loader hidden"></span>
                    <svg id="cmd-arrow" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                    </svg>
                  </button>
                </div>
                
                <!-- Quick Commands -->
                <div class="mb-4">
                  <div class="text-xs text-slate-500 uppercase tracking-wider mb-2">Quick Commands</div>
                  <div class="flex flex-wrap gap-2">
                    <button class="quick-cmd px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg text-sm transition-all hover:border-cyan-500/50 hover:text-cyan-400" data-cmd="getinfo">getinfo</button>
                    <button class="quick-cmd px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg text-sm transition-all hover:border-cyan-500/50 hover:text-cyan-400" data-cmd="getver">getver</button>
                    <button class="quick-cmd px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg text-sm transition-all hover:border-cyan-500/50 hover:text-cyan-400" data-cmd="getstatus">getstatus</button>
                    <button class="quick-cmd px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg text-sm transition-all hover:border-cyan-500/50 hover:text-cyan-400" data-cmd="getgps">getgps</button>
                    <button class="quick-cmd px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg text-sm transition-all hover:border-cyan-500/50 hover:text-cyan-400" data-cmd="getio">getio</button>
                    <button class="quick-cmd px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg text-sm transition-all hover:border-cyan-500/50 hover:text-cyan-400" data-cmd="getparam">getparam</button>
                  </div>
                </div>
                
                <!-- Command History -->
                <div>
                  <div class="text-xs text-slate-500 uppercase tracking-wider mb-2">Command History</div>
                  <div id="cmd-history" class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar"></div>
                </div>
              </div>
            </div>
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

    // Search functionality
    document.getElementById('device-search').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.replace(/\D/g, ''); // Only digits
      e.target.value = this.searchQuery;
      this.renderList(App.devices);
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
    const countEl = document.getElementById('device-count');
    let deviceArray = Object.values(devices);
    
    // Filter by search
    if (this.searchQuery) {
      deviceArray = deviceArray.filter(d => d.imei.includes(this.searchQuery));
    }
    
    // Update count
    const onlineCount = deviceArray.filter(d => d.status === 'online').length;
    countEl.textContent = `${onlineCount} online`;
    
    if (deviceArray.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <div class="w-12 h-12 mx-auto mb-3 bg-slate-700/50 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p class="text-slate-500 text-sm">${this.searchQuery ? 'No devices match your search' : 'No devices connected'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = deviceArray.map(d => {
      const isSelected = this.selectedImei === d.imei;
      const isOnline = d.status === 'online';
      
      return `
        <div class="group p-3 rounded-xl cursor-pointer transition-all duration-200 ${isSelected 
          ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/50 shadow-lg shadow-cyan-500/10' 
          : 'bg-slate-800/50 hover:bg-slate-700/50 border border-transparent hover:border-slate-600/50'}" 
             onclick="DevicesComponent.selectDevice('${d.imei}')">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-slate-500'}"></div>
              <span class="font-mono text-sm font-medium ${isSelected ? 'text-cyan-400' : ''}">${d.imei}</span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-xs font-medium ${isOnline 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-slate-600/50 text-slate-400'}">${d.status}</span>
          </div>
          ${d.lastPosition ? `
            <div class="flex items-center gap-3 text-xs text-slate-400">
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                </svg>
                ${d.lastPosition.lat?.toFixed(4)}, ${d.lastPosition.lng?.toFixed(4)}
              </span>
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                ${d.lastPosition.speed || 0} km/h
              </span>
            </div>
          ` : ''}
          <div class="flex items-center gap-2 mt-2 text-xs text-slate-500">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            ${d.messageCount || 0} messages
          </div>
        </div>
      `;
    }).join('');
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
    const isOnline = device.status === 'online';
    
    document.getElementById('device-details').innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Left Column - Basic Info -->
        <div class="space-y-4">
          <!-- IMEI Card -->
          <div class="p-4 bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl border border-slate-600/30">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">IMEI</div>
            <div class="font-mono text-xl font-bold text-white">${device.imei}</div>
          </div>
          
          <!-- Status Grid -->
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
              <div class="text-xs text-slate-500 mb-1">Status</div>
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse' : 'bg-slate-500'}"></div>
                <span class="font-medium ${isOnline ? 'text-green-400' : 'text-slate-400'}">${device.status}</span>
              </div>
            </div>
            <div class="p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
              <div class="text-xs text-slate-500 mb-1">Messages</div>
              <div class="font-bold text-lg">${device.messageCount || 0}</div>
            </div>
          </div>
          
          <!-- Connection Time -->
          <div class="p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
            <div class="text-xs text-slate-500 mb-1">Connected Since</div>
            <div class="text-sm font-medium">${device.connectedAt ? Utils.formatDateTime(device.connectedAt) : 'N/A'}</div>
          </div>
        </div>
        
        <!-- Right Column - Position -->
        ${pos ? `
          <div class="p-4 bg-gradient-to-br from-blue-900/30 to-cyan-900/30 rounded-xl border border-cyan-500/20">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <span class="font-semibold text-cyan-400">Last Position</span>
            </div>
            
            <div class="space-y-3">
              <div class="flex items-center justify-between p-2 bg-slate-900/30 rounded-lg">
                <span class="text-slate-400 text-sm">Coordinates</span>
                <span class="font-mono text-sm">${pos.lat?.toFixed(6)}, ${pos.lng?.toFixed(6)}</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex items-center gap-2 p-2 bg-slate-900/30 rounded-lg">
                  <svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <div>
                    <div class="text-xs text-slate-500">Speed</div>
                    <div class="font-medium">${pos.speed || 0} km/h</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 p-2 bg-slate-900/30 rounded-lg">
                  <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                  <div>
                    <div class="text-xs text-slate-500">Satellites</div>
                    <div class="font-medium">${pos.satellites || 0}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 p-2 bg-slate-900/30 rounded-lg">
                  <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/>
                  </svg>
                  <div>
                    <div class="text-xs text-slate-500">Altitude</div>
                    <div class="font-medium">${pos.altitude || 0}m</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 p-2 bg-slate-900/30 rounded-lg">
                  <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"/>
                  </svg>
                  <div>
                    <div class="text-xs text-slate-500">Heading</div>
                    <div class="font-medium">${pos.angle || 0}°</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div class="p-4 bg-slate-800/50 rounded-xl border border-slate-700/30 flex items-center justify-center">
            <div class="text-center text-slate-500">
              <svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              </svg>
              <p class="text-sm">No position data available</p>
            </div>
          </div>
        `}
      </div>
    `;
    
    this.renderCommandHistory(device.commandHistory);
  },

  renderCommandHistory(history) {
    const container = document.getElementById('cmd-history');
    
    if (!history || history.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-slate-500">
          <svg class="w-6 h-6 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <p class="text-sm">No commands sent yet</p>
        </div>
      `;
      return;
    }

    container.innerHTML = history.slice(0, 10).map(c => `
      <div class="p-3 bg-slate-900/50 rounded-xl border border-slate-700/30">
        <div class="flex items-start gap-2">
          <svg class="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="font-mono text-sm text-cyan-400">${Utils.escapeHtml(c.command)}</div>
            ${c.response ? `
              <div class="flex items-start gap-1 mt-1">
                <svg class="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                <span class="text-green-400 text-sm break-all">${Utils.escapeHtml(c.response)}</span>
              </div>
            ` : ''}
            ${c.error ? `
              <div class="flex items-start gap-1 mt-1">
                <svg class="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                <span class="text-red-400 text-sm">${Utils.escapeHtml(c.error)}</span>
              </div>
            ` : ''}
            <div class="text-slate-500 text-xs mt-1">${Utils.formatTime(c.sentAt)}</div>
          </div>
        </div>
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
    document.getElementById('cmd-arrow').classList.add('hidden');
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
        document.getElementById('cmd-arrow').classList.remove('hidden');
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
    document.getElementById('cmd-arrow').classList.remove('hidden');
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
    document.getElementById('cmd-arrow').classList.remove('hidden');
    document.getElementById('cmd-send').disabled = false;
    Utils.showToast(`Error: ${msg.error}`, 'error');
  }
};

window.DevicesComponent = DevicesComponent;
