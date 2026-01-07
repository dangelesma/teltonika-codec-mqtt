/**
 * Logs Component - System logs viewer
 */

const LogsComponent = {
  container: null,
  currentFilter: 'all',
  logs: [],

  init() {
    this.container = document.getElementById('tab-logs');
    this.render();
    this.setupEventListeners();
  },

  render() {
    this.container.innerHTML = `
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold">📋 System Logs</h2>
          <div class="flex gap-2">
            <button class="log-filter active px-3 py-1 bg-cyan-600 rounded text-sm transition-colors" data-level="all">All</button>
            <button class="log-filter px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-level="info">Info</button>
            <button class="log-filter px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-level="warn">Warn</button>
            <button class="log-filter px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors" data-level="error">Error</button>
            <button id="clear-logs" class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">Clear</button>
          </div>
        </div>
        <div id="logs-container" class="font-mono text-sm bg-slate-900 rounded-lg p-4 h-[500px] overflow-y-auto"></div>
      </div>
    `;
  },

  setupEventListeners() {
    this.container.querySelectorAll('.log-filter').forEach(btn => {
      btn.addEventListener('click', () => this.setFilter(btn.dataset.level));
    });

    document.getElementById('clear-logs').addEventListener('click', () => this.clearLogs());
  },

  setFilter(level) {
    this.currentFilter = level;
    
    // Update button states
    this.container.querySelectorAll('.log-filter').forEach(btn => {
      if (btn.dataset.level === level) {
        btn.classList.add('active', 'bg-cyan-600');
        btn.classList.remove('bg-slate-700');
      } else {
        btn.classList.remove('active', 'bg-cyan-600');
        btn.classList.add('bg-slate-700');
      }
    });

    // Clear and reload logs
    document.getElementById('logs-container').innerHTML = '';
    WS.send({ type: 'getLogs', limit: 100, level: level === 'all' ? undefined : level });
  },

  addLog(log) {
    if (this.currentFilter !== 'all' && log.level !== this.currentFilter) {
      return;
    }

    const colors = {
      info: 'text-blue-400',
      warn: 'text-yellow-400',
      error: 'text-red-400',
      debug: 'text-purple-400'
    };

    const container = document.getElementById('logs-container');
    const entry = document.createElement('div');
    entry.className = 'py-1 border-b border-slate-800';
    entry.innerHTML = `
      <span class="text-slate-500">${Utils.formatTime(log.timestamp)}</span>
      <span class="${colors[log.level] || ''} px-2">[${log.level.toUpperCase()}]</span>
      <span class="text-cyan-400">[${Utils.escapeHtml(log.source)}]</span>
      ${Utils.escapeHtml(log.message)}
    `;
    
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  },

  addLogs(logs) {
    logs.forEach(log => this.addLog(log));
  },

  clear() {
    document.getElementById('logs-container').innerHTML = '';
    this.logs = [];
  },

  clearLogs() {
    WS.send({ type: 'clearLogs' });
    Utils.showToast('Logs cleared', 'info');
  }
};

window.LogsComponent = LogsComponent;
