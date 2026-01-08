/**
 * Main Application Controller
 */

const App = {
  devices: {},

  init() {
    this.setupTabs();
    Auth.init();
  },

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  },

  switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('active', 'border-cyan-400', 'text-cyan-400');
        btn.classList.remove('border-transparent', 'text-slate-400');
      } else {
        btn.classList.remove('active', 'border-cyan-400', 'text-cyan-400');
        btn.classList.add('border-transparent', 'text-slate-400');
      }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    document.getElementById(`tab-${tab}`).classList.remove('hidden');

    // Tab-specific actions
    switch (tab) {
      case 'map':
        MapComponent.invalidateSize();
        break;
      case 'security':
        SecurityComponent.loadConfig();
        break;
      case 'mqtt':
        WS.send({ type: 'getMqttStatus' });
        break;
      case 'webhook':
        if (typeof WebhookComponent !== 'undefined') {
          WebhookComponent.loadConfig();
        }
        break;
    }
  },

  handleInit(data) {
    // Initialize devices
    data.devices.forEach(device => {
      this.devices[device.imei] = device;
      MapComponent.updateMarker(device);
    });

    // Update UI
    this.updateStats(data.stats);
    this.updateAllViews();

    // Add initial logs
    if (data.logs) {
      LogsComponent.addLogs(data.logs);
    }
  },

  handleDeviceUpdate(device) {
    this.devices[device.imei] = device;
    MapComponent.updateMarker(device);
    this.updateAllViews();
  },

  handleDeviceDisconnected(imei) {
    if (this.devices[imei]) {
      this.devices[imei].status = 'offline';
      MapComponent.updateMarker(this.devices[imei]);
    }
    this.updateAllViews();
  },

  updateStats(stats) {
    document.getElementById('stat-online').textContent = stats.onlineDevices || 0;
    document.getElementById('stat-total').textContent = stats.totalDevices || 0;
    document.getElementById('stat-messages').textContent = stats.totalMessages || 0;
  },

  updateAllViews() {
    MapComponent.renderDeviceList(this.devices);
    DevicesComponent.renderList(this.devices);

    // Update selected device if any
    if (DevicesComponent.selectedImei && this.devices[DevicesComponent.selectedImei]) {
      DevicesComponent.renderDetails(this.devices[DevicesComponent.selectedImei]);
    }

    // Update security connected devices
    if (typeof SecurityComponent !== 'undefined' && SecurityComponent.renderConnectedDevices) {
      SecurityComponent.renderConnectedDevices();
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

window.App = App;
