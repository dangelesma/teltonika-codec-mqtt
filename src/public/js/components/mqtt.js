/**
 * MQTT Component - MQTT broker configuration
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
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- MQTT Status -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4">📡 MQTT Connection Status</h2>
          <div id="mqtt-status-display" class="space-y-4">
            <div class="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
              <div class="flex items-center gap-3">
                <div id="mqtt-status-indicator" class="w-4 h-4 rounded-full bg-gray-500"></div>
                <span id="mqtt-status-text" class="font-medium">Unknown</span>
              </div>
              <button id="mqtt-reconnect-btn" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm transition-colors">
                Reconnect
              </button>
            </div>
            
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="p-3 bg-slate-800 rounded-lg">
                <div class="text-slate-400">Broker</div>
                <div id="mqtt-broker-display" class="font-mono mt-1">-</div>
              </div>
              <div class="p-3 bg-slate-800 rounded-lg">
                <div class="text-slate-400">Messages Published</div>
                <div id="mqtt-messages-count" class="font-mono mt-1">0</div>
              </div>
              <div class="p-3 bg-slate-800 rounded-lg">
                <div class="text-slate-400">Last Connected</div>
                <div id="mqtt-last-connected" class="text-sm mt-1">-</div>
              </div>
              <div class="p-3 bg-slate-800 rounded-lg">
                <div class="text-slate-400">Last Error</div>
                <div id="mqtt-last-error" class="text-sm mt-1 text-red-400">-</div>
              </div>
            </div>
          </div>
        </div>

        <!-- MQTT Configuration -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4">⚙️ MQTT Configuration</h2>
          <form id="mqtt-config-form" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-slate-400 mb-1">Protocol</label>
                <select id="mqtt-protocol" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none">
                  <option value="mqtt">mqtt</option>
                  <option value="mqtts">mqtts (TLS)</option>
                  <option value="ws">ws</option>
                  <option value="wss">wss (TLS)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm text-slate-400 mb-1">Port</label>
                <input type="number" id="mqtt-port" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" placeholder="1883">
              </div>
            </div>
            
            <div>
              <label class="block text-sm text-slate-400 mb-1">Host</label>
              <input type="text" id="mqtt-host" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" placeholder="mqtt.example.com">
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-medium text-slate-300 mb-3">Authentication</h3>
              <div class="space-y-3">
                <div>
                  <label class="block text-sm text-slate-400 mb-1">Username</label>
                  <input type="text" id="mqtt-username" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" placeholder="Optional">
                </div>
                <div>
                  <label class="block text-sm text-slate-400 mb-1">Password</label>
                  <input type="password" id="mqtt-password" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" placeholder="Optional">
                </div>
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-medium text-slate-300 mb-3">TLS Options</h3>
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="mqtt-reject-unauthorized" class="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-600 focus:ring-cyan-400">
                <span class="text-sm">Reject unauthorized certificates</span>
              </label>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-medium text-slate-300 mb-3">Topic Configuration</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-slate-400 mb-1">Realm</label>
                  <input type="text" id="mqtt-realm" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" placeholder="master">
                </div>
                <div>
                  <label class="block text-sm text-slate-400 mb-1">Keyword</label>
                  <input type="text" id="mqtt-keyword" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none" placeholder="teltonika">
                </div>
              </div>
              <div class="mt-3">
                <label class="block text-sm text-slate-400 mb-1">Topic Preview</label>
                <div id="mqtt-topic-preview" class="p-2 bg-slate-800 rounded text-sm font-mono text-cyan-400"></div>
              </div>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="submit" class="flex-1 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors">
                Save & Apply
              </button>
              <button type="button" id="mqtt-test-btn" class="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors">
                Test Connection
              </button>
            </div>
          </form>
          
          <div id="mqtt-save-status" class="mt-4 hidden"></div>
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
    document.getElementById('mqtt-topic-preview').textContent = 
      `${realm}/${keyword}/{IMEI}/data`;
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
      statusEl.className = 'mt-4 p-3 bg-slate-700 rounded-lg text-sm';
      statusEl.innerHTML = '<span class="loader mr-2"></span> Saving configuration...';
      statusEl.classList.remove('hidden');

      const data = await Utils.apiRequest('/api/mqtt/config', {
        method: 'POST',
        body: JSON.stringify(config)
      });

      if (data.success) {
        statusEl.className = 'mt-4 p-3 bg-green-900 rounded-lg text-sm text-green-300';
        statusEl.textContent = '✓ Configuration saved and applied';
        Utils.showToast('MQTT configuration saved', 'success');
        this.config = config;
      }
    } catch (error) {
      statusEl.className = 'mt-4 p-3 bg-red-900 rounded-lg text-sm text-red-300';
      statusEl.textContent = `✗ ${error.message}`;
      Utils.showToast('Failed to save MQTT config', 'error');
    }

    setTimeout(() => statusEl.classList.add('hidden'), 5000);
  },

  async testConnection() {
    const config = this.getFormData();
    const btn = document.getElementById('mqtt-test-btn');
    const originalText = btn.textContent;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="loader"></span>';

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
      btn.textContent = originalText;
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
    const brokerDisplay = document.getElementById('mqtt-broker-display');
    const messagesCount = document.getElementById('mqtt-messages-count');
    const lastConnected = document.getElementById('mqtt-last-connected');
    const lastError = document.getElementById('mqtt-last-error');

    // Update status indicator
    if (status.connected) {
      indicator.className = 'w-4 h-4 rounded-full bg-green-500';
      text.textContent = 'Connected';
      text.className = 'font-medium text-green-400';
    } else {
      indicator.className = 'w-4 h-4 rounded-full bg-red-500';
      text.textContent = 'Disconnected';
      text.className = 'font-medium text-red-400';
    }

    // Update details
    brokerDisplay.textContent = status.broker || '-';
    messagesCount.textContent = status.messagesPublished || 0;
    lastConnected.textContent = status.lastConnected ? Utils.formatDateTime(status.lastConnected) : '-';
    lastError.textContent = status.lastError || '-';
  },

  handleConfigUpdated(data) {
    if (data.success) {
      Utils.showToast('MQTT configuration applied', 'success');
      this.loadConfig();
    }
  }
};

window.MqttComponent = MqttComponent;
