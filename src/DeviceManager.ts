/**
 * DeviceManager - Enhanced multi-device management
 * Tracks device status, history, and provides API for device operations
 */

import { EventEmitter } from 'events';
import { Socket } from 'net';

export interface DeviceInfo {
  imei: string;
  uuid: string;
  connectedAt: Date;
  lastSeen: Date;
  lastPosition?: {
    lat: number;
    lng: number;
    altitude: number;
    speed: number;
    angle: number;
    satellites: number;
    timestamp: Date;
  };
  commandHistory: CommandHistoryEntry[];
  messageCount: number;
  status: 'online' | 'offline';
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  sentAt: Date;
  response?: string;
  respondedAt?: Date;
  status: 'pending' | 'success' | 'error' | 'timeout';
  error?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  data?: any;
}

class DeviceManager extends EventEmitter {
  private devices: Map<string, DeviceInfo> = new Map();
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private maxCommandHistory: number = 100;

  constructor() {
    super();
  }

  /**
   * Register a new device connection
   */
  registerDevice(imei: string, uuid: string): DeviceInfo {
    const existingDevice = this.devices.get(imei);
    
    const device: DeviceInfo = {
      imei,
      uuid,
      connectedAt: existingDevice?.connectedAt || new Date(),
      lastSeen: new Date(),
      lastPosition: existingDevice?.lastPosition,
      commandHistory: existingDevice?.commandHistory || [],
      messageCount: existingDevice?.messageCount || 0,
      status: 'online'
    };

    this.devices.set(imei, device);
    this.log('info', 'DeviceManager', `Device ${imei} connected`, { uuid });
    this.emit('deviceConnected', device);
    
    return device;
  }

  /**
   * Unregister a device (disconnected)
   */
  unregisterDevice(imei: string): void {
    const device = this.devices.get(imei);
    if (device) {
      device.status = 'offline';
      this.log('info', 'DeviceManager', `Device ${imei} disconnected`);
      this.emit('deviceDisconnected', device);
    }
  }

  /**
   * Update device position
   */
  updatePosition(imei: string, position: DeviceInfo['lastPosition']): void {
    const device = this.devices.get(imei);
    if (device) {
      device.lastPosition = position;
      device.lastSeen = new Date();
      device.messageCount++;
      this.emit('positionUpdate', device);
    }
  }

  /**
   * Add command to history
   */
  addCommand(imei: string, commandId: string, command: string): CommandHistoryEntry | null {
    const device = this.devices.get(imei);
    if (!device) return null;

    const entry: CommandHistoryEntry = {
      id: commandId,
      command,
      sentAt: new Date(),
      status: 'pending'
    };

    device.commandHistory.unshift(entry);
    
    // Keep only last N commands
    if (device.commandHistory.length > this.maxCommandHistory) {
      device.commandHistory = device.commandHistory.slice(0, this.maxCommandHistory);
    }

    this.log('info', 'DeviceManager', `Command sent to ${imei}: ${command}`, { commandId });
    this.emit('commandSent', { imei, entry });
    
    return entry;
  }

  /**
   * Update command with response
   */
  updateCommandResponse(imei: string, commandId: string, response: string, success: boolean, error?: string): void {
    const device = this.devices.get(imei);
    if (!device) return;

    const entry = device.commandHistory.find(c => c.id === commandId);
    if (entry) {
      entry.response = response;
      entry.respondedAt = new Date();
      entry.status = success ? 'success' : 'error';
      entry.error = error;
      
      this.log(success ? 'info' : 'error', 'DeviceManager', 
        `Command response from ${imei}: ${success ? 'success' : 'error'}`, 
        { commandId, response, error });
      this.emit('commandResponse', { imei, entry });
    }
  }

  /**
   * Get device by IMEI
   */
  getDevice(imei: string): DeviceInfo | undefined {
    return this.devices.get(imei);
  }

  /**
   * Get all devices
   */
  getAllDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get online devices
   */
  getOnlineDevices(): DeviceInfo[] {
    return this.getAllDevices().filter(d => d.status === 'online');
  }

  /**
   * Get device statistics
   */
  getStats(): {
    totalDevices: number;
    onlineDevices: number;
    totalMessages: number;
    totalCommands: number;
  } {
    const devices = this.getAllDevices();
    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter(d => d.status === 'online').length,
      totalMessages: devices.reduce((sum, d) => sum + d.messageCount, 0),
      totalCommands: devices.reduce((sum, d) => sum + d.commandHistory.length, 0)
    };
  }

  /**
   * Add log entry
   */
  log(level: LogEntry['level'], source: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source,
      message,
      data
    };

    this.logs.unshift(entry);
    
    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Console output
    const prefix = `[${entry.timestamp.toISOString()}] [${level.toUpperCase()}] [${source}]`;
    if (level === 'error') {
      console.error(prefix, message, data || '');
    } else if (level === 'warn') {
      console.warn(prefix, message, data || '');
    } else {
      console.log(prefix, message, data || '');
    }

    this.emit('log', entry);
  }

  /**
   * Get logs
   */
  getLogs(limit: number = 100, level?: LogEntry['level']): LogEntry[] {
    let filtered = this.logs;
    if (level) {
      filtered = filtered.filter(l => l.level === level);
    }
    return filtered.slice(0, limit);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    this.emit('logsCleared');
  }
}

// Export singleton
export const deviceManager = new DeviceManager();
