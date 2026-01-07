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
          <div class="mb-3">
            <input type="text" id="imei-search" 
                   class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none" 
                   placeholder="🔍 Search by IMEI (max 15 digits)"
                   maxlength="15"
                   pattern="[0-9]*"
                   inputmode="numeric">
          </div>
          <div id="map-device-list" class="space-y-2 max-h-80 overflow-y-auto"></div>
        </div>
      </div>
    `;
    
    // Setup IMEI search
    document.getElementById('imei-search').addEventListener('input', (e) => {
      // Only allow digits
      e.target.value = e.target.value.replace(/\D/g, '').substring(0, 15);
      this.renderDeviceList(App.devices);
    });
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
    const searchInput = document.getElementById('imei-search');
    const searchTerm = searchInput ? searchInput.value : '';
    
    let onlineDevices = Object.values(devices).filter(d => d.status === 'online');
    
    // Filter by IMEI search
    if (searchTerm) {
      onlineDevices = onlineDevices.filter(d => d.imei.includes(searchTerm));
    }
    
    const container = document.getElementById('map-device-list');
    
    if (onlineDevices.length === 0) {
      container.innerHTML = searchTerm 
        ? `<div class="text-slate-400 text-sm text-center py-4">No devices match "${searchTerm}"</div>`
        : '<div class="text-slate-400 text-sm text-center py-4">No online devices</div>';
      return;
    }

    container.innerHTML = onlineDevices.map(d => {
      // Highlight matching IMEI part
      let displayImei = d.imei;
      if (searchTerm) {
        const idx = d.imei.indexOf(searchTerm);
        if (idx !== -1) {
          displayImei = d.imei.substring(0, idx) + 
                       '<span class="bg-cyan-600 rounded px-0.5">' + searchTerm + '</span>' + 
                       d.imei.substring(idx + searchTerm.length);
        }
      }
      
      return `
        <div class="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition-colors" 
             onclick="MapComponent.focusDevice('${d.imei}')">
          <div class="font-mono text-sm">${displayImei}</div>
          ${d.lastPosition ? `
            <div class="text-xs text-slate-400 mt-1">
              📍 ${d.lastPosition.lat?.toFixed(5)}, ${d.lastPosition.lng?.toFixed(5)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 100);
    }
  }
};

window.MapComponent = MapComponent;
