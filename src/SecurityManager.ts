/**
 * Security Module - Authentication, Rate Limiting, and Device Authorization
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { IncomingMessage } from 'http';
import { deviceManager } from './DeviceManager';

export interface SecurityConfig {
  // API Authentication
  apiKeyEnabled: boolean;
  apiKey: string;
  
  // IMEI Whitelist
  imeiWhitelistEnabled: boolean;
  imeiWhitelist: string[];
  
  // Rate Limiting
  rateLimitEnabled: boolean;
  rateLimitWindow: number; // ms
  rateLimitMaxRequests: number;
  
  // IP Whitelist (for web API)
  ipWhitelistEnabled: boolean;
  ipWhitelist: string[];
  
  // Device connection limits
  maxDevicesPerIp: number;
  maxConnectionAttempts: number;
  connectionAttemptWindow: number; // ms
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface ConnectionAttempt {
  attempts: number;
  firstAttempt: number;
  blocked: boolean;
  blockedUntil?: number;
}

class SecurityManager {
  private config: SecurityConfig;
  private rateLimitStore: Map<string, RateLimitEntry> = new Map();
  private connectionAttempts: Map<string, ConnectionAttempt> = new Map();
  private blockedIps: Set<string> = new Set();
  private devicesByIp: Map<string, Set<string>> = new Map();
  private configChangeListeners: ((config: SecurityConfig) => void)[] = [];

  constructor() {
    this.config = this.loadConfig();
    
    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), 60000);
    
    deviceManager.log('info', 'Security', 'Security module initialized', {
      apiKeyEnabled: this.config.apiKeyEnabled,
      imeiWhitelistEnabled: this.config.imeiWhitelistEnabled,
      rateLimitEnabled: this.config.rateLimitEnabled,
      ipWhitelistEnabled: this.config.ipWhitelistEnabled
    });
  }

  /**
   * Subscribe to config changes
   */
  onConfigChange(listener: (config: SecurityConfig) => void): void {
    this.configChangeListeners.push(listener);
  }

  /**
   * Notify config change listeners
   */
  private notifyConfigChange(): void {
    this.configChangeListeners.forEach(listener => listener(this.config));
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(updates: Partial<SecurityConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };
    
    deviceManager.log('info', 'Security', 'Configuration updated', {
      changes: Object.keys(updates)
    });
    
    this.notifyConfigChange();
  }

  /**
   * Get full configuration (for UI)
   */
  getFullConfig(): SecurityConfig & { blockedIps: string[] } {
    return { 
      ...this.config,
      blockedIps: Array.from(this.blockedIps)
    };
  }

  private loadConfig(): SecurityConfig {
    return {
      // API Key - generate random if not set
      apiKeyEnabled: process.env.SECURITY_API_KEY_ENABLED === 'true',
      apiKey: process.env.SECURITY_API_KEY || randomBytes(32).toString('hex'),
      
      // IMEI Whitelist
      imeiWhitelistEnabled: process.env.SECURITY_IMEI_WHITELIST_ENABLED === 'true',
      imeiWhitelist: (process.env.SECURITY_IMEI_WHITELIST || '').split(',').filter(Boolean),
      
      // Rate Limiting
      rateLimitEnabled: process.env.SECURITY_RATE_LIMIT_ENABLED !== 'false',
      rateLimitWindow: parseInt(process.env.SECURITY_RATE_LIMIT_WINDOW || '60000'),
      rateLimitMaxRequests: parseInt(process.env.SECURITY_RATE_LIMIT_MAX || '100'),
      
      // IP Whitelist
      ipWhitelistEnabled: process.env.SECURITY_IP_WHITELIST_ENABLED === 'true',
      ipWhitelist: (process.env.SECURITY_IP_WHITELIST || '').split(',').filter(Boolean),
      
      // Connection limits
      maxDevicesPerIp: parseInt(process.env.SECURITY_MAX_DEVICES_PER_IP || '10'),
      maxConnectionAttempts: parseInt(process.env.SECURITY_MAX_CONN_ATTEMPTS || '5'),
      connectionAttemptWindow: parseInt(process.env.SECURITY_CONN_ATTEMPT_WINDOW || '300000') // 5 min
    };
  }

  /**
   * Validate API request authentication
   */
  validateApiAuth(req: IncomingMessage): { valid: boolean; error?: string } {
    if (!this.config.apiKeyEnabled) {
      return { valid: true };
    }

    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];
    
    let providedKey: string | undefined;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      providedKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    }

    if (!providedKey) {
      this.logSecurityEvent('warn', 'Missing API key', { 
        ip: this.getClientIp(req),
        path: req.url 
      });
      return { valid: false, error: 'API key required' };
    }

    // Use timing-safe comparison to prevent timing attacks
    const valid = this.secureCompare(providedKey, this.config.apiKey);
    
    if (!valid) {
      this.logSecurityEvent('warn', 'Invalid API key attempt', { 
        ip: this.getClientIp(req),
        path: req.url 
      });
    }

    return { valid, error: valid ? undefined : 'Invalid API key' };
  }

  /**
   * Check rate limit for an IP
   */
  checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
    if (!this.config.rateLimitEnabled) {
      return { allowed: true, remaining: -1, resetIn: 0 };
    }

    const now = Date.now();
    let entry = this.rateLimitStore.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 1,
        resetAt: now + this.config.rateLimitWindow
      };
      this.rateLimitStore.set(ip, entry);
      return { 
        allowed: true, 
        remaining: this.config.rateLimitMaxRequests - 1,
        resetIn: this.config.rateLimitWindow
      };
    }

    entry.count++;
    
    if (entry.count > this.config.rateLimitMaxRequests) {
      this.logSecurityEvent('warn', 'Rate limit exceeded', { ip, count: entry.count });
      return { 
        allowed: false, 
        remaining: 0,
        resetIn: entry.resetAt - now
      };
    }

    return { 
      allowed: true, 
      remaining: this.config.rateLimitMaxRequests - entry.count,
      resetIn: entry.resetAt - now
    };
  }

  /**
   * Validate if IMEI is authorized
   */
  validateImei(imei: string): { valid: boolean; reason?: string } {
    // Basic IMEI format validation (15 digits)
    if (!/^\d{15}$/.test(imei)) {
      this.logSecurityEvent('warn', 'Invalid IMEI format', { imei });
      return { valid: false, reason: 'Invalid IMEI format' };
    }

    // Luhn check for IMEI validity
    if (!this.luhnCheck(imei)) {
      this.logSecurityEvent('warn', 'IMEI failed Luhn check', { imei });
      return { valid: false, reason: 'Invalid IMEI checksum' };
    }

    // Whitelist check
    if (this.config.imeiWhitelistEnabled) {
      if (!this.config.imeiWhitelist.includes(imei)) {
        this.logSecurityEvent('warn', 'IMEI not in whitelist', { imei });
        return { valid: false, reason: 'IMEI not authorized' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate device connection attempt
   */
  validateConnection(ip: string, imei?: string): { allowed: boolean; reason?: string } {
    // Check if IP is blocked
    if (this.blockedIps.has(ip)) {
      const attempt = this.connectionAttempts.get(ip);
      if (attempt?.blockedUntil && attempt.blockedUntil > Date.now()) {
        return { allowed: false, reason: 'IP temporarily blocked' };
      }
      this.blockedIps.delete(ip);
    }

    // Check IP whitelist (if enabled)
    if (this.config.ipWhitelistEnabled && !this.config.ipWhitelist.includes(ip)) {
      this.logSecurityEvent('warn', 'Connection from non-whitelisted IP', { ip });
      return { allowed: false, reason: 'IP not authorized' };
    }

    // Check connection attempts
    const now = Date.now();
    let attempt = this.connectionAttempts.get(ip);
    
    if (!attempt || (now - attempt.firstAttempt) > this.config.connectionAttemptWindow) {
      attempt = { attempts: 1, firstAttempt: now, blocked: false };
      this.connectionAttempts.set(ip, attempt);
    } else {
      attempt.attempts++;
      
      if (attempt.attempts > this.config.maxConnectionAttempts) {
        attempt.blocked = true;
        attempt.blockedUntil = now + this.config.connectionAttemptWindow;
        this.blockedIps.add(ip);
        this.logSecurityEvent('error', 'IP blocked - too many connection attempts', { 
          ip, 
          attempts: attempt.attempts 
        });
        return { allowed: false, reason: 'Too many connection attempts' };
      }
    }

    // Check devices per IP
    const devicesFromIp = this.devicesByIp.get(ip) || new Set();
    if (imei && !devicesFromIp.has(imei) && devicesFromIp.size >= this.config.maxDevicesPerIp) {
      this.logSecurityEvent('warn', 'Max devices per IP reached', { ip, count: devicesFromIp.size });
      return { allowed: false, reason: 'Maximum devices per IP exceeded' };
    }

    return { allowed: true };
  }

  /**
   * Register a device connection from an IP
   */
  registerDeviceConnection(ip: string, imei: string): void {
    let devices = this.devicesByIp.get(ip);
    if (!devices) {
      devices = new Set();
      this.devicesByIp.set(ip, devices);
    }
    devices.add(imei);
    
    // Reset connection attempts on successful connection
    this.connectionAttempts.delete(ip);
  }

  /**
   * Unregister a device connection
   */
  unregisterDeviceConnection(ip: string, imei: string): void {
    const devices = this.devicesByIp.get(ip);
    if (devices) {
      devices.delete(imei);
      if (devices.size === 0) {
        this.devicesByIp.delete(ip);
      }
    }
  }

  /**
   * Validate IP for web API access
   */
  validateWebAccess(ip: string): { allowed: boolean; reason?: string } {
    // Rate limit check
    const rateLimit = this.checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return { allowed: false, reason: 'Rate limit exceeded' };
    }

    // IP whitelist (if enabled)
    if (this.config.ipWhitelistEnabled && !this.config.ipWhitelist.includes(ip)) {
      return { allowed: false, reason: 'IP not authorized' };
    }

    return { allowed: true };
  }

  /**
   * Get client IP from request
   */
  getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * Luhn algorithm check for IMEI validation
   */
  private luhnCheck(imei: string): boolean {
    let sum = 0;
    let isEven = false;
    
    for (let i = imei.length - 1; i >= 0; i--) {
      let digit = parseInt(imei[i], 10);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }

  /**
   * Timing-safe string comparison
   */
  private secureCompare(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      
      if (bufA.length !== bufB.length) {
        return false;
      }
      
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  /**
   * Log security event
   */
  private logSecurityEvent(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    deviceManager.log(level, 'Security', message, data);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Cleanup rate limit entries
    for (const [ip, entry] of this.rateLimitStore.entries()) {
      if (entry.resetAt <= now) {
        this.rateLimitStore.delete(ip);
      }
    }
    
    // Cleanup connection attempts
    for (const [ip, attempt] of this.connectionAttempts.entries()) {
      if ((now - attempt.firstAttempt) > this.config.connectionAttemptWindow) {
        this.connectionAttempts.delete(ip);
        this.blockedIps.delete(ip);
      }
    }
  }

  /**
   * Get current security status
   */
  getStatus(): {
    blockedIps: number;
    activeRateLimits: number;
    connectedDeviceIps: number;
    config: Partial<SecurityConfig>;
  } {
    return {
      blockedIps: this.blockedIps.size,
      activeRateLimits: this.rateLimitStore.size,
      connectedDeviceIps: this.devicesByIp.size,
      config: {
        apiKeyEnabled: this.config.apiKeyEnabled,
        imeiWhitelistEnabled: this.config.imeiWhitelistEnabled,
        rateLimitEnabled: this.config.rateLimitEnabled,
        ipWhitelistEnabled: this.config.ipWhitelistEnabled,
        maxDevicesPerIp: this.config.maxDevicesPerIp
      }
    };
  }

  /**
   * Add IMEI to whitelist dynamically
   */
  addImeiToWhitelist(imei: string): void {
    if (!this.config.imeiWhitelist.includes(imei)) {
      this.config.imeiWhitelist.push(imei);
      this.logSecurityEvent('info', 'IMEI added to whitelist', { imei });
    }
  }

  /**
   * Remove IMEI from whitelist
   */
  removeImeiFromWhitelist(imei: string): void {
    const index = this.config.imeiWhitelist.indexOf(imei);
    if (index > -1) {
      this.config.imeiWhitelist.splice(index, 1);
      this.logSecurityEvent('info', 'IMEI removed from whitelist', { imei });
    }
  }

  /**
   * Get IMEI whitelist
   */
  getImeiWhitelist(): string[] {
    return [...this.config.imeiWhitelist];
  }

  /**
   * Block an IP manually
   */
  blockIp(ip: string, durationMs: number = 3600000): void {
    this.blockedIps.add(ip);
    this.connectionAttempts.set(ip, {
      attempts: 999,
      firstAttempt: Date.now(),
      blocked: true,
      blockedUntil: Date.now() + durationMs
    });
    this.logSecurityEvent('info', 'IP manually blocked', { ip, durationMs });
  }

  /**
   * Unblock an IP
   */
  unblockIp(ip: string): void {
    this.blockedIps.delete(ip);
    this.connectionAttempts.delete(ip);
    this.logSecurityEvent('info', 'IP unblocked', { ip });
  }

  /**
   * Get blocked IPs
   */
  getBlockedIps(): string[] {
    return Array.from(this.blockedIps);
  }

  /**
   * Clear all blocked IPs
   */
  clearBlockedIps(): void {
    this.blockedIps.clear();
    this.connectionAttempts.clear();
    this.logSecurityEvent('info', 'All blocked IPs cleared');
  }

  /**
   * Regenerate API key
   */
  regenerateApiKey(): string {
    this.config.apiKey = randomBytes(32).toString('hex');
    this.logSecurityEvent('info', 'API key regenerated');
    return this.config.apiKey;
  }

  /**
   * Get API key (for initial setup display)
   */
  getApiKey(): string {
    return this.config.apiKey;
  }

  /**
   * Hash data for logging (avoid logging sensitive info)
   */
  hashForLog(data: string): string {
    return createHash('sha256').update(data).digest('hex').substring(0, 8);
  }
}

// Export singleton
export const securityManager = new SecurityManager();
