/**
 * Map Component - OpenStreetMap with Leaflet
 */

const MapComponent = {
  map: null,
  markers: {},
  container: null,

  init() {
    this.container = document.getElementById('tab-map');
    this.render();
    this.initMap();
  },

  render() {
    this.container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 card">
          <h2 class="text-lg font-semibold mb-4">📍 Device Locations</h2>
          <div id="map"></div>
        </div>
        <div class="card">
          <h2 class="text-lg font-semibold mb-4">📱 Online Devices</h2>
          <div id="map-device-list" class="space-y-2 max-h-96 overflow-y-auto"></div>
        </div>
      </div>
    `;
  },

  initMap() {
    if (this.map) return;
    
    this.map = L.map('map').setView([-12.0464, -77.0428], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  },

  updateMarker(device) {
    if (!device.lastPosition?.lat || !device.lastPosition?.lng) return;
    
    const { lat, lng } = device.lastPosition;
    const isOnline = device.status === 'online';
    
    const icon = L.divIcon({
      className: `device-marker ${isOnline ? '' : 'offline'}`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    if (this.markers[device.imei]) {
      this.markers[device.imei].setLatLng([lat, lng]).setIcon(icon);
    } else {
      this.markers[device.imei] = L.marker([lat, lng], { icon }).addTo(this.map);
    }

    const popupContent = `
      <div class="text-slate-900">
        <b>${device.imei}</b><br>
        Speed: ${device.lastPosition.speed || 0} km/h<br>
        Satellites: ${device.lastPosition.satellites || 0}<br>
        ${device.lastPosition.altitude ? `Altitude: ${device.lastPosition.altitude}m` : ''}
      </div>
    `;
    this.markers[device.imei].bindPopup(popupContent);
  },

  focusDevice(imei) {
    const device = App.devices[imei];
    if (device?.lastPosition) {
      this.map.setView([device.lastPosition.lat, device.lastPosition.lng], 16);
      if (this.markers[imei]) {
        this.markers[imei].openPopup();
      }
    }
  },

  renderDeviceList(devices) {
    const onlineDevices = Object.values(devices).filter(d => d.status === 'online');
    const container = document.getElementById('map-device-list');
    
    if (onlineDevices.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-sm text-center py-4">No online devices</div>';
      return;
    }

    container.innerHTML = onlineDevices.map(d => `
      <div class="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition-colors" 
           onclick="MapComponent.focusDevice('${d.imei}')">
        <div class="font-mono text-sm">${d.imei}</div>
        ${d.lastPosition ? `
          <div class="text-xs text-slate-400 mt-1">
            📍 ${d.lastPosition.lat?.toFixed(5)}, ${d.lastPosition.lng?.toFixed(5)}
          </div>
        ` : ''}
      </div>
    `).join('');
  },

  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 100);
    }
  }
};

window.MapComponent = MapComponent;
