/**
 * MQTT Component - MQTT broker configuration
 * Modern UI with better organization
 */

const MqttComponent = {
  container: null,
  config: null,
  status: null,

  init() {
    this.container = document.getElementById('tab-mqtt');
    this.render();
    this.setupEventListeners();
    this.loadConfig();
  },

  render() {
    this.container.innerHTML = `
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <!-- Left Column - Status & Stats -->
        <div class="xl:col-span-1 space-y-6">
          
          <!-- Connection Status Card -->
          <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <div class="p-4 border-b border-slate-700/50 bg-slate-800/50">
              <h2 class="text-lg font-bold flex items-center gap-2">
                <span class="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center text-sm">📡</span>
                Connection Status
              </h2>
            </div>
            <div class="p-4">
              <!-- Main Status -->
              <div id="mqtt-main-status" class="p-4 bg-gradient-to-r from-slate-800/50 to-slate-700/30 rounded-xl border border-slate-700/50 mb-4">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3">
                    <div id="mqtt-status-indicator" class="w-3 h-3 rounded-full bg-gray-500 shadow-lg"></div>
                    <span id="mqtt-status-text" class="font-semibold">Unknown</span>
                  </div>
                  <button id="mqtt-reconnect-btn" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl text-sm font-medium transition-all shadow-lg shadow-cyan-500/20">
                    Reconnect
                  </button>
                </div>
                <div class="flex items-center gap-2 p-2 bg-slate-900/50 rounded-lg">
                  <svg class="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                  </svg>
                  <code id="mqtt-broker-display" class="text-xs text-cyan-400 font-mono break-all">-</code>
                </div>
              </div>
              
              <!-- Stats Grid -->
              <div class="grid grid-cols-2 gap-3">
                <div class="p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
                  <div class="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
                    </svg>
                    Published
                  </div>
                  <div id="mqtt-messages-count" class="text-2xl font-bold text-emerald-400">0</div>
                </div>
                <div class="p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
                  <div class="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Uptime
                  </div>
                  <div id="mqtt-uptime" class="text-lg font-bold text-cyan-400">-</div>
                </div>
              </div>
              
              <!-- Last Events -->
              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                  <span class="text-xs text-slate-500">Last Connected</span>
                  <span id="mqtt-last-connected" class="text-xs font-mono text-slate-400">-</span>
                </div>
                <div class="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                  <span class="text-xs text-slate-500">Last Error</span>
                  <span id="mqtt-last-error" class="text-xs font-mono text-red-400 truncate max-w-[180px]" title="">-</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Topic Preview Card -->
          <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <div class="p-4 border-b border-slate-700/50 bg-slate-800/50">
              <h2 class="text-lg font-bold flex items-center gap-2">
                <span class="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center text-sm">🏷️</span>
                Topic Structure
              </h2>
            </div>
            <div class="p-4">
              <div class="space-y-3">
                <div>
                  <div class="text-xs text-slate-500 uppercase tracking-wider mb-2">Pattern</div>
                  <div id="mqtt-topic-preview" class="p-3 bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl border border-purple-500/20 font-mono text-sm text-purple-300">
                    master/teltonika/{IMEI}/data
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center text-xs">
                  <div class="p-2 bg-slate-800/50 rounded-lg">
                    <div class="text-purple-400 font-medium">Realm</div>
                    <div id="mqtt-realm-preview" class="text-slate-400 font-mono">master</div>
                  </div>
                  <div class="p-2 bg-slate-800/50 rounded-lg">
                    <div class="text-pink-400 font-medium">Keyword</div>
                    <div id="mqtt-keyword-preview" class="text-slate-400 font-mono">teltonika</div>
                  </div>
                  <div class="p-2 bg-slate-800/50 rounded-lg">
                    <div class="text-cyan-400 font-medium">Type</div>
                    <div class="text-slate-400 font-mono">data</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
        
        <!-- Right Column - Configuration -->
        <div class="xl:col-span-2">
          <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <div class="p-4 border-b border-slate-700/50 bg-slate-800/50">
              <h2 class="text-lg font-bold flex items-center gap-2">
                <span class="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center text-sm">⚙️</span>
                MQTT Configuration
              </h2>
            </div>
            
            <form id="mqtt-config-form" class="p-4">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <!-- Connection Settings -->
                <div class="space-y-4">
                  <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2 pb-2 border-b border-slate-700/50">
                    <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                    </svg>
                    Connection
                  </h3>
                  
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Protocol</label>
                      <select id="mqtt-protocol" class="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all">
                        <option value="mqtt">mqtt://</option>
                        <option value="mqtts">mqtts:// (TLS)</option>
                        <option value="ws">ws://</option>
                        <option value="wss">wss:// (TLS)</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Port</label>
                      <input type="number" id="mqtt-port" class="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all" placeholder="1883">
                    </div>
                  </div>
                  
                  <div>
                    <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Host / Broker URL</label>
                    <input type="text" id="mqtt-host" class="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all" placeholder="mqtt.example.com">
                  </div>
                  
                  <!-- TLS Option -->
                  <div class="p-3 bg-slate-900/30 rounded-xl border border-slate-700/30">
                    <label class="flex items-center gap-3 cursor-pointer">
                      <div class="relative">
                        <input type="checkbox" id="mqtt-reject-unauthorized" class="sr-only peer">
                        <div class="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-cyan-600 transition-colors"></div>
                        <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                      </div>
                      <div>
                        <div class="text-sm font-medium">Verify TLS Certificates</div>
                        <div class="text-xs text-slate-500">Reject unauthorized/self-signed certificates</div>
                      </div>
                    </label>
                  </div>
                </div>
                
                <!-- Authentication -->
                <div class="space-y-4">
                  <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2 pb-2 border-b border-slate-700/50">
                    <svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
                    </svg>
                    Authentication
                  </h3>
                  
                  <div>
                    <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
                    <div class="relative">
                      <input type="text" id="mqtt-username" class="w-full pl-10 pr-3 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all" placeholder="Optional">
                      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <div>
                    <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                    <div class="relative">
                      <input type="password" id="mqtt-password" class="w-full pl-10 pr-10 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all" placeholder="Optional">
                      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                      <button type="button" onclick="MqttComponent.togglePassword()" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        <svg id="password-eye" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <!-- Topic Configuration -->
                  <h3 class="text-sm font-semibold text-slate-300 flex items-center gap-2 pb-2 border-b border-slate-700/50 pt-2">
                    <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                    </svg>
                    Topic Settings
                  </h3>
                  
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Realm</label>
                      <input type="text" id="mqtt-realm" class="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all font-mono" placeholder="master">
                    </div>
                    <div>
                      <label class="block text-xs text-slate-500 uppercase tracking-wider mb-1.5">Keyword</label>
                      <input type="text" id="mqtt-keyword" class="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none transition-all font-mono" placeholder="teltonika">
                    </div>
                  </div>
                </div>
                
              </div>
              
              <!-- Action Buttons -->
              <div class="flex gap-3 mt-6 pt-4 border-t border-slate-700/50">
                <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl font-medium transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  Save & Apply
                </button>
                <button type="button" id="mqtt-test-btn" class="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-xl font-medium transition-all flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                  Test
                </button>
              </div>
              
              <!-- Save Status -->
              <div id="mqtt-save-status" class="mt-4 hidden"></div>
            </form>
          </div>
        </div>
        
      </div>
    `;
  },

  setupEventListeners() {
    document.getElementById('mqtt-config-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveConfig();
    });

    document.getElementById('mqtt-test-btn').addEventListener('click', () => this.testConnection());
    document.getElementById('mqtt-reconnect-btn').addEventListener('click', () => this.reconnect());

    // Update topic preview on input change
    ['mqtt-realm', 'mqtt-keyword'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.updateTopicPreview());
    });
  },

  togglePassword() {
    const input = document.getElementById('mqtt-password');
    const eye = document.getElementById('password-eye');
    if (input.type === 'password') {
      input.type = 'text';
      eye.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>';
    } else {
      input.type = 'password';
      eye.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
    }
  },

  async loadConfig() {
    try {
      const data = await Utils.apiRequest('/api/mqtt/config');
      if (data.success) {
        this.config = data.config;
        this.populateForm(data.config);
        this.updateTopicPreview();
      }
    } catch (error) {
      Utils.showToast('Failed to load MQTT config', 'error');
    }

    // Load status
    WS.send({ type: 'getMqttStatus' });
  },

  populateForm(config) {
    document.getElementById('mqtt-protocol').value = config.protocol || 'mqtt';
    document.getElementById('mqtt-host').value = config.host || '';
    document.getElementById('mqtt-port').value = config.port || 1883;
    document.getElementById('mqtt-username').value = config.username || '';
    document.getElementById('mqtt-password').value = ''; // Don't show password
    document.getElementById('mqtt-reject-unauthorized').checked = config.rejectUnauthorized !== false;
    document.getElementById('mqtt-realm').value = config.realm || 'master';
    document.getElementById('mqtt-keyword').value = config.keyword || 'teltonika';
  },

  updateTopicPreview() {
    const realm = document.getElementById('mqtt-realm').value || 'master';
    const keyword = document.getElementById('mqtt-keyword').value || 'teltonika';
    
    document.getElementById('mqtt-topic-preview').textContent = `${realm}/${keyword}/{IMEI}/data`;
    document.getElementById('mqtt-realm-preview').textContent = realm;
    document.getElementById('mqtt-keyword-preview').textContent = keyword;
  },

  getFormData() {
    return {
      protocol: document.getElementById('mqtt-protocol').value,
      host: document.getElementById('mqtt-host').value,
      port: parseInt(document.getElementById('mqtt-port').value),
      username: document.getElementById('mqtt-username').value || undefined,
      password: document.getElementById('mqtt-password').value || undefined,
      rejectUnauthorized: document.getElementById('mqtt-reject-unauthorized').checked,
      realm: document.getElementById('mqtt-realm').value,
      keyword: document.getElementById('mqtt-keyword').value
    };
  },

  async saveConfig() {
    const config = this.getFormData();
    const statusEl = document.getElementById('mqtt-save-status');
    
    try {
      statusEl.className = 'mt-4 p-3 bg-slate-700/50 rounded-xl text-sm flex items-center gap-2';
      statusEl.innerHTML = '<span class="loader"></span> Saving configuration...';
      statusEl.classList.remove('hidden');

      const data = await Utils.apiRequest('/api/mqtt/config', {
        method: 'POST',
        body: JSON.stringify(config)
      });

      if (data.success) {
        statusEl.className = 'mt-4 p-3 bg-green-900/50 rounded-xl text-sm text-green-300 flex items-center gap-2';
        statusEl.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Configuration saved and applied';
        Utils.showToast('MQTT configuration saved', 'success');
        this.config = config;
      }
    } catch (error) {
      statusEl.className = 'mt-4 p-3 bg-red-900/50 rounded-xl text-sm text-red-300 flex items-center gap-2';
      statusEl.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg> ${error.message}`;
      Utils.showToast('Failed to save MQTT config', 'error');
    }

    setTimeout(() => statusEl.classList.add('hidden'), 5000);
  },

  async testConnection() {
    const config = this.getFormData();
    const btn = document.getElementById('mqtt-test-btn');
    const originalHTML = btn.innerHTML;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="loader"></span> Testing...';

      const data = await Utils.apiRequest('/api/mqtt/test', {
        method: 'POST',
        body: JSON.stringify(config)
      });

      if (data.success) {
        Utils.showToast('Connection successful!', 'success');
      } else {
        Utils.showToast(`Connection failed: ${data.error}`, 'error');
      }
    } catch (error) {
      Utils.showToast(`Test failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  },

  reconnect() {
    WS.send({ type: 'mqttReconnect' });
    Utils.showToast('Reconnecting to MQTT...', 'info');
  },

  updateStatus(status) {
    this.status = status;
    
    const indicator = document.getElementById('mqtt-status-indicator');
    const text = document.getElementById('mqtt-status-text');
    const mainStatus = document.getElementById('mqtt-main-status');
    const brokerDisplay = document.getElementById('mqtt-broker-display');
    const messagesCount = document.getElementById('mqtt-messages-count');
    const lastConnected = document.getElementById('mqtt-last-connected');
    const lastError = document.getElementById('mqtt-last-error');

    // Update status indicator
    if (status.connected) {
      indicator.className = 'w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50 animate-pulse';
      text.textContent = 'Connected';
      text.className = 'font-semibold text-green-400';
      mainStatus.className = 'p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/20 rounded-xl border border-green-500/30 mb-4';
    } else {
      indicator.className = 'w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50';
      text.textContent = 'Disconnected';
      text.className = 'font-semibold text-red-400';
      mainStatus.className = 'p-4 bg-gradient-to-r from-red-900/30 to-rose-900/20 rounded-xl border border-red-500/30 mb-4';
    }

    // Update details
    brokerDisplay.textContent = status.broker || '-';
    messagesCount.textContent = status.messagesPublished || 0;
    lastConnected.textContent = status.lastConnected ? Utils.formatDateTime(status.lastConnected) : '-';
    
    const errorText = status.lastError || '-';
    lastError.textContent = errorText;
    lastError.title = errorText;
  },

  handleConfigUpdated(data) {
    if (data.success) {
      Utils.showToast('MQTT configuration applied', 'success');
      this.loadConfig();
    }
  }
};

window.MqttComponent = MqttComponent;
