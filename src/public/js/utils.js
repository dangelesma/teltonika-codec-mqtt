/**
 * Utility functions
 */

const Utils = {
  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const colors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      info: 'bg-blue-600',
      warning: 'bg-yellow-600'
    };
    
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-lg ${colors[type] || colors.info} text-white animate-fade-in`;
    toast.textContent = message;
    document.getElementById('toasts').appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  /**
   * Format date/time
   */
  formatTime(date) {
    return new Date(date).toLocaleTimeString();
  },

  formatDateTime(date) {
    return new Date(date).toLocaleString();
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * API request helper
   */
  async apiRequest(url, options = {}) {
    const token = Auth.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  /**
   * Create element with classes
   */
  createElement(tag, className, innerHTML = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  },

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Make globally available
window.Utils = Utils;
