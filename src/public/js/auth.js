/**
 * Authentication Module
 */

const Auth = {
  token: null,

  init() {
    this.token = localStorage.getItem('token');
    this.setupLoginForm();
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());

    if (this.token) {
      this.verifyToken();
    }
  },

  setupLoginForm() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = document.getElementById('login-user').value;
      const pass = document.getElementById('login-pass').value;

      try {
        const data = await Utils.apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: user, password: pass })
        });

        if (data.success) {
          this.token = data.token;
          localStorage.setItem('token', this.token);
          this.showDashboard();
        }
      } catch (error) {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = error.message || 'Invalid credentials';
        errorEl.classList.remove('hidden');
      }
    });
  },

  async verifyToken() {
    try {
      const data = await Utils.apiRequest('/api/auth/verify');
      if (data.success) {
        this.showDashboard();
      } else {
        this.logout();
      }
    } catch (error) {
      this.logout();
    }
  },

  showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    // Initialize components
    MapComponent.init();
    DevicesComponent.init();
    MqttComponent.init();
    WebhookComponent.init(document.getElementById('tab-webhook'));
    SecurityComponent.init();
    LogsComponent.init();

    // Connect WebSocket
    WS.connect();
  },

  logout() {
    this.token = null;
    localStorage.removeItem('token');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    WS.disconnect();
  },

  getToken() {
    return this.token;
  },

  isAuthenticated() {
    return !!this.token;
  }
};

window.Auth = Auth;
