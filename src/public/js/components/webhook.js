/**
 * GPS Webhook Configuration Component
 */

const WebhookComponent = {
    container: null,
    config: {
        enabled: false,
        url: '',
        queueSize: 0,
        failureCount: 0
    },

    init(container) {
        this.container = container;
        this.render();
        this.loadConfig();
    },

    render() {
        this.container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <h2 class="text-2xl font-bold text-white">🔗 GPS Webhook Configuration</h2>
          <div id="webhook-status" class="flex items-center gap-2">
            <div id="webhook-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
            <span id="webhook-status-text" class="text-sm text-slate-400">Loading...</span>
          </div>
        </div>

        <!-- Description -->
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <p class="text-slate-300 text-sm">
            Configure the GPS webhook to forward vehicle location data to an external GPS system (like Sistema GPS).
            When enabled, all GPS data received from devices will be sent via HTTP POST to the configured URL.
          </p>
        </div>

        <!-- Configuration Form -->
        <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <form id="webhook-form" class="space-y-4">
            <!-- Enable Toggle -->
            <div class="flex items-center justify-between">
              <label class="text-white font-medium">Enable Webhook</label>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="webhook-enabled" class="sr-only peer">
                <div class="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            <!-- URL -->
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">Webhook URL</label>
              <input type="url" id="webhook-url" 
                class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none text-white"
                placeholder="https://gps.example.com/api/gps/ingest">
            </div>

            <!-- API Key -->
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">API Key (Optional)</label>
              <input type="text" id="webhook-apikey" 
                class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none text-white"
                placeholder="Leave empty if not required">
            </div>

            <!-- Timeout -->
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">Timeout (ms)</label>
              <input type="number" id="webhook-timeout" value="5000" min="1000" max="30000"
                class="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:outline-none text-white">
            </div>

            <!-- Buttons -->
            <div class="flex gap-3 pt-4">
              <button type="submit" class="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold transition-colors">
                💾 Save Configuration
              </button>
              <button type="button" id="test-webhook-btn" class="px-6 py-3 bg-slate-600 hover:bg-slate-500 rounded-lg font-semibold transition-colors">
                🧪 Test
              </button>
            </div>
          </form>
        </div>

        <!-- Status Info -->
        <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 class="text-lg font-semibold text-white mb-4">Queue Status</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center p-4 bg-slate-700 rounded-lg">
              <div id="queue-size" class="text-2xl font-bold text-cyan-400">0</div>
              <div class="text-sm text-slate-400">Pending</div>
            </div>
            <div class="text-center p-4 bg-slate-700 rounded-lg">
              <div id="failure-count" class="text-2xl font-bold text-orange-400">0</div>
              <div class="text-sm text-slate-400">Failures</div>
            </div>
          </div>
        </div>

        <!-- Help -->
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-lg font-semibold text-white mb-2">📖 Integration Guide</h3>
          <div class="text-sm text-slate-300 space-y-2">
            <p><strong>Endpoint Format:</strong> The webhook will POST JSON data to your URL with the following structure:</p>
            <pre class="bg-slate-900 p-3 rounded mt-2 text-xs overflow-x-auto"><code>{
  "imei": "353691844288760",
  "latitude": -12.0464,
  "longitude": -77.0428,
  "speed": 45.5,
  "heading": 180,
  "altitude": 150,
  "timestamp": "2024-01-08T15:30:00.000Z",
  "satellites": 10,
  "metadata": {}
}</code></pre>
            <p class="mt-2"><strong>Headers:</strong> If API Key is set, it will be sent as <code class="bg-slate-700 px-1 rounded">X-API-Key</code> header.</p>
          </div>
        </div>
      </div>
    `;

        this.bindEvents();
    },

    bindEvents() {
        const form = document.getElementById('webhook-form');
        const testBtn = document.getElementById('test-webhook-btn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveConfig();
        });

        testBtn.addEventListener('click', async () => {
            await this.testWebhook();
        });
    },

    async loadConfig() {
        try {
            const response = await api.get('/webhook/gps');
            if (response.success) {
                this.config = response.config;
                this.updateUI();
            }
        } catch (error) {
            console.error('Failed to load webhook config:', error);
            showToast('Failed to load webhook configuration', 'error');
        }
    },

    updateUI() {
        document.getElementById('webhook-enabled').checked = this.config.enabled;
        document.getElementById('webhook-url').value = this.config.url || '';
        document.getElementById('queue-size').textContent = this.config.queueSize || 0;
        document.getElementById('failure-count').textContent = this.config.failureCount || 0;

        const indicator = document.getElementById('webhook-indicator');
        const statusText = document.getElementById('webhook-status-text');

        if (this.config.enabled && this.config.url) {
            indicator.className = 'w-3 h-3 rounded-full bg-green-500';
            statusText.textContent = 'Active';
            statusText.className = 'text-sm text-green-400';
        } else if (this.config.enabled) {
            indicator.className = 'w-3 h-3 rounded-full bg-yellow-500';
            statusText.textContent = 'No URL';
            statusText.className = 'text-sm text-yellow-400';
        } else {
            indicator.className = 'w-3 h-3 rounded-full bg-gray-500';
            statusText.textContent = 'Disabled';
            statusText.className = 'text-sm text-slate-400';
        }
    },

    async saveConfig() {
        const enabled = document.getElementById('webhook-enabled').checked;
        const url = document.getElementById('webhook-url').value;
        const apiKey = document.getElementById('webhook-apikey').value;
        const timeout = parseInt(document.getElementById('webhook-timeout').value) || 5000;

        try {
            const response = await api.post('/webhook/gps', {
                enabled,
                url,
                apiKey,
                timeout
            });

            if (response.success) {
                this.config = response.config;
                this.updateUI();
                showToast('Webhook configuration saved!', 'success');
            } else {
                showToast('Failed to save configuration', 'error');
            }
        } catch (error) {
            console.error('Failed to save webhook config:', error);
            showToast('Failed to save configuration', 'error');
        }
    },

    async testWebhook() {
        const testBtn = document.getElementById('test-webhook-btn');
        testBtn.disabled = true;
        testBtn.textContent = '⏳ Testing...';

        try {
            const response = await api.post('/webhook/gps/test', {});

            if (response.success) {
                showToast('Test data sent successfully!', 'success');
            } else {
                showToast(response.message || 'Test failed', 'warning');
            }
        } catch (error) {
            console.error('Webhook test failed:', error);
            showToast('Test failed: ' + error.message, 'error');
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = '🧪 Test';
        }
    },

    // Called from websocket when config updates
    handleConfigUpdate(config) {
        this.config = config;
        this.updateUI();
    }
};

// Register component
window.WebhookComponent = WebhookComponent;
