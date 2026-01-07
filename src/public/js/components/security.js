/**
 * Security Component - Whitelist and security settings
 */

const SecurityComponent = {
  container: null,
  config: null,

  init() {
    this.container = document.getElementById('tab-security');
    this.render();
    this.setupEventListeners();
  },

  render() {
    this.container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- IMEI Whitelist -->
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-semibold">📋 IMEI Whitelist</h2>
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-sm text-slate-400">Enabled</span>
              <div id="whitelist-toggle" class="toggle-switch" onclick="SecurityComponent.toggleWhitelist()"></div>
            </label>
          </div>
          
          <!-- Add from connected devices -->
          <div class="mb-4">
            <h3 class="text-sm font-medium text-slate-300 mb-2">Add from connected:</h3>
            <div id="connected-devices-whitelist" class="flex flex-wrap gap-2"></div>
          </div>
          
          <!-- Whitelist items -->
          <div id="whitelist-items" class="space-y-2 max-h-64 overflow-y-auto mb-4"></div>
          
          <!-- Add new IMEI -->
          <div class="flex gap-2">
            <input type="text" id="new-imei" 
                   class="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none" 
                   placeholder="Enter 15-digit IMEI"
                   maxlength="15">
            <button id="add-imei-btn" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm transition-colors">
              Add
            </button>
          </div>
        </div>

        <!-- Security Settings -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4">⚙️ Security Settings</h2>
          <div class="space-y-4">
            <!-- Rate Limiting -->
            <div class="flex justify-between items-center py-3 border-b border-slate-700">
              <div>
                <div class="font-medium">Rate Limiting</div>
                <div class="text-sm text-slate-400">Limit requests per IP address</div>
              </div>
              <div id="rate-limit-toggle" class="toggle-switch" onclick="SecurityComponent.toggleRateLimit()"></div>
            </div>

            <!-- Max Devices per IP -->
            <div class="flex justify-between items-center py-3 border-b border-slate-700">
              <div>
                <div class="font-medium">Max Devices per IP</div>
                <div class="text-sm text-slate-400">Prevent multiple device spoofing</div>
              </div>
              <input type="number" id="max-devices-ip" 
                     class="w-20 px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-center focus:ring-2 focus:ring-cyan-400 focus:outline-none" 
                     value="5" min="1" max="100">
            </div>

            <!-- Max Connection Attempts -->
            <div class="flex justify-between items-center py-3 border-b border-slate-700">
              <div>
                <div class="font-medium">Max Connection Attempts</div>
                <div class="text-sm text-slate-400">Before temporary IP block</div>
              </div>
              <input type="number" id="max-conn-attempts" 
                     class="w-20 px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-center focus:ring-2 focus:ring-cyan-400 focus:outline-none" 
                     value="10" min="1" max="100">
            </div>

            <!-- API Key -->
            <div class="py-3 border-b border-slate-700">
              <div class="flex justify-between items-center mb-2">
                <div>
                  <div class="font-medium">API Key Authentication</div>
                  <div class="text-sm text-slate-400">Protect REST API endpoints</div>
                </div>
                <div id="api-key-toggle" class="toggle-switch" onclick="SecurityComponent.toggleApiKey()"></div>
              </div>
              <div id="api-key-section" class="hidden mt-3">
                <div class="flex gap-2">
                  <input type="text" id="api-key-display" 
                         class="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm font-mono" 
                         readonly>
                  <button id="regenerate-api-key" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            </div>

            <!-- Blocked IPs -->
            <div class="py-3">
              <div class="flex justify-between items-center mb-3">
                <div>
                  <div class="font-medium">Blocked IPs</div>
                  <div class="text-sm text-slate-400">IPs blocked due to suspicious activity</div>
                </div>
                <button id="clear-blocked-ips" class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">
                  Clear All
                </button>
              </div>
              <div id="blocked-ips-list" class="max-h-32 overflow-y-auto space-y-1"></div>
            </div>
          </div>

          <button id="save-security-btn" class="w-full mt-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors">
            Save Settings
          </button>
        </div>
      </div>
    `;
  },

  setupEventListeners() {
    document.getElementById('add-imei-btn').addEventListener('click', () => this.addImei());
    document.getElementById('new-imei').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addImei();
    });
    document.getElementById('save-security-btn').addEventListener('click', () => this.saveSettings());
    document.getElementById('regenerate-api-key').addEventListener('click', () => this.regenerateApiKey());
    document.getElementById('clear-blocked-ips').addEventListener('click', () => this.clearBlockedIps());
  },

  loadConfig() {
    WS.send({ type: 'getSecurityConfig' });
  },

  updateConfig(config) {
    this.config = config;
    
    // Update toggles
    this.setToggle('whitelist-toggle', config.imeiWhitelistEnabled);
    this.setToggle('rate-limit-toggle', config.rateLimitEnabled);
    this.setToggle('api-key-toggle', config.apiKeyEnabled);
    
    // Update inputs
    document.getElementById('max-devices-ip').value = config.maxDevicesPerIp || 5;
    document.getElementById('max-conn-attempts').value = config.maxConnectionAttempts || 10;
    
    // Update API key section
    const apiKeySection = document.getElementById('api-key-section');
    if (config.apiKeyEnabled) {
      apiKeySection.classList.remove('hidden');
      document.getElementById('api-key-display').value = config.apiKey || '********';
    } else {
      apiKeySection.classList.add('hidden');
    }
    
    // Render whitelist
    this.renderWhitelist(config.imeiWhitelist || []);
    
    // Render blocked IPs
    this.renderBlockedIps(config.blockedIps || []);
    
    // Render connected devices for whitelist
    this.renderConnectedDevices();
  },

  setToggle(id, active) {
    const toggle = document.getElementById(id);
    if (active) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  },

  toggleWhitelist() {
    const toggle = document.getElementById('whitelist-toggle');
    toggle.classList.toggle('active');
  },

  toggleRateLimit() {
    const toggle = document.getElementById('rate-limit-toggle');
    toggle.classList.toggle('active');
  },

  toggleApiKey() {
    const toggle = document.getElementById('api-key-toggle');
    toggle.classList.toggle('active');
    
    const section = document.getElementById('api-key-section');
    if (toggle.classList.contains('active')) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  },

  renderWhitelist(whitelist) {
    const container = document.getElementById('whitelist-items');
    
    if (!whitelist || whitelist.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">Whitelist is empty</div>';
      return;
    }

    container.innerHTML = whitelist.map(imei => `
      <div class="flex justify-between items-center p-2 bg-slate-700 rounded">
        <span class="font-mono text-sm">${imei}</span>
        <button class="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors" 
                onclick="SecurityComponent.removeFromWhitelist('${imei}')">
          Remove
        </button>
      </div>
    `).join('');
  },

  renderConnectedDevices() {
    const container = document.getElementById('connected-devices-whitelist');
    const whitelist = this.config?.imeiWhitelist || [];
    const devices = Object.values(App.devices || {});
    
    const notWhitelisted = devices.filter(d => d.status === 'online' && !whitelist.includes(d.imei));
    
    if (notWhitelisted.length === 0) {
      container.innerHTML = '<span class="text-slate-400 text-sm">All connected devices are whitelisted</span>';
      return;
    }

    container.innerHTML = notWhitelisted.map(d => `
      <button class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors" 
              onclick="SecurityComponent.addToWhitelist('${d.imei}')">
        + ${d.imei}
      </button>
    `).join('');
  },

  renderBlockedIps(ips) {
    const container = document.getElementById('blocked-ips-list');
    
    if (!ips || ips.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-sm">No blocked IPs</div>';
      return;
    }

    container.innerHTML = ips.map(ip => `
      <div class="flex justify-between items-center p-2 bg-slate-800 rounded text-sm">
        <span class="font-mono">${ip}</span>
        <button class="text-red-400 hover:text-red-300" onclick="SecurityComponent.unblockIp('${ip}')">
          Unblock
        </button>
      </div>
    `).join('');
  },

  addImei() {
    const input = document.getElementById('new-imei');
    const imei = input.value.trim();
    
    if (imei.length !== 15 || !/^\d+$/.test(imei)) {
      Utils.showToast('IMEI must be 15 digits', 'error');
      return;
    }

    this.addToWhitelist(imei);
    input.value = '';
  },

  addToWhitelist(imei) {
    WS.send({ type: 'addToWhitelist', imei });
    Utils.showToast(`Added ${imei} to whitelist`, 'success');
  },

  removeFromWhitelist(imei) {
    WS.send({ type: 'removeFromWhitelist', imei });
    Utils.showToast(`Removed ${imei} from whitelist`, 'info');
  },

  saveSettings() {
    const config = {
      imeiWhitelistEnabled: document.getElementById('whitelist-toggle').classList.contains('active'),
      rateLimitEnabled: document.getElementById('rate-limit-toggle').classList.contains('active'),
      apiKeyEnabled: document.getElementById('api-key-toggle').classList.contains('active'),
      maxDevicesPerIp: parseInt(document.getElementById('max-devices-ip').value),
      maxConnectionAttempts: parseInt(document.getElementById('max-conn-attempts').value)
    };

    WS.send({ type: 'updateSecurityConfig', config });
    Utils.showToast('Security settings saved', 'success');
  },

  regenerateApiKey() {
    WS.send({ type: 'regenerateApiKey' });
    Utils.showToast('API key regenerated', 'success');
  },

  clearBlockedIps() {
    WS.send({ type: 'clearBlockedIps' });
    Utils.showToast('Blocked IPs cleared', 'success');
  },

  unblockIp(ip) {
    WS.send({ type: 'unblockIp', ip });
    Utils.showToast(`Unblocked ${ip}`, 'success');
  }
};

window.SecurityComponent = SecurityComponent;
