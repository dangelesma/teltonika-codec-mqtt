/**
 * CommandManager - Manages commands to Teltonika devices via Codec 12
 * Handles command queuing, socket management, and response tracking
 */

import { Socket } from 'net';
import { EventEmitter } from 'events';
import { buildCodec12Command, parseCodec12Response, isCodec12Response, Codec12Response } from './Codec12';

export interface PendingCommand {
  command: string;
  timestamp: number;
  resolve: (response: Codec12Response) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface DeviceConnection {
  imei: string;
  uuid: string;
  socket: Socket;
  pendingCommands: PendingCommand[];
}

export class CommandManager extends EventEmitter {
  private connections: Map<string, DeviceConnection> = new Map();
  private imeiToUuid: Map<string, string> = new Map();
  private commandTimeout: number;

  constructor(commandTimeoutMs: number = 30000) {
    super();
    this.commandTimeout = commandTimeoutMs;
  }

  /**
   * Register a device connection
   */
  registerDevice(imei: string, uuid: string, socket: Socket): void {
    console.log(`[CommandManager] Registering device IMEI: ${imei}, UUID: ${uuid}`);
    
    const connection: DeviceConnection = {
      imei,
      uuid,
      socket,
      pendingCommands: []
    };

    this.connections.set(uuid, connection);
    this.imeiToUuid.set(imei, uuid);
  }

  /**
   * Unregister a device connection
   */
  unregisterDevice(uuid: string): void {
    const connection = this.connections.get(uuid);
    if (connection) {
      console.log(`[CommandManager] Unregistering device IMEI: ${connection.imei}`);
      
      // Reject all pending commands
      for (const pending of connection.pendingCommands) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Device disconnected'));
      }
      
      this.imeiToUuid.delete(connection.imei);
      this.connections.delete(uuid);
    }
  }

  /**
   * Get connection by IMEI
   */
  getConnectionByImei(imei: string): DeviceConnection | undefined {
    const uuid = this.imeiToUuid.get(imei);
    if (uuid) {
      return this.connections.get(uuid);
    }
    return undefined;
  }

  /**
   * Get connection by UUID
   */
  getConnectionByUuid(uuid: string): DeviceConnection | undefined {
    return this.connections.get(uuid);
  }

  /**
   * Check if device is connected
   */
  isDeviceConnected(imei: string): boolean {
    return this.imeiToUuid.has(imei);
  }

  /**
   * Send a command to a device by IMEI
   */
  async sendCommand(imei: string, command: string): Promise<Codec12Response> {
    const connection = this.getConnectionByImei(imei);
    
    if (!connection) {
      return { success: false, error: `Device ${imei} is not connected` };
    }

    if (!connection.socket || connection.socket.destroyed) {
      return { success: false, error: `Socket for device ${imei} is not available` };
    }

    return new Promise((resolve, reject) => {
      const commandBuffer = buildCodec12Command(command);
      
      console.log(`[CommandManager] Sending command to ${imei}: "${command}"`);
      console.log(`[CommandManager] Command buffer (hex): ${commandBuffer.toString('hex')}`);

      const timeout = setTimeout(() => {
        const index = connection.pendingCommands.findIndex(p => p.command === command);
        if (index !== -1) {
          connection.pendingCommands.splice(index, 1);
        }
        resolve({ success: false, error: 'Command timeout' });
      }, this.commandTimeout);

      const pendingCommand: PendingCommand = {
        command,
        timestamp: Date.now(),
        resolve,
        reject,
        timeout
      };

      connection.pendingCommands.push(pendingCommand);

      try {
        connection.socket.write(commandBuffer, (err) => {
          if (err) {
            clearTimeout(timeout);
            const index = connection.pendingCommands.findIndex(p => p.command === command);
            if (index !== -1) {
              connection.pendingCommands.splice(index, 1);
            }
            resolve({ success: false, error: `Write error: ${err.message}` });
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        const index = connection.pendingCommands.findIndex(p => p.command === command);
        if (index !== -1) {
          connection.pendingCommands.splice(index, 1);
        }
        resolve({ success: false, error: `Send error: ${error}` });
      }
    });
  }

  /**
   * Handle incoming data that might be a Codec 12 response
   * Returns true if data was a Codec 12 response, false otherwise
   */
  handlePossibleResponse(uuid: string, data: Buffer): boolean {
    if (!isCodec12Response(data)) {
      return false;
    }

    const connection = this.connections.get(uuid);
    if (!connection) {
      console.warn(`[CommandManager] Received response for unknown UUID: ${uuid}`);
      return true;
    }

    const parsedResponse = parseCodec12Response(data);
    console.log(`[CommandManager] Received Codec 12 response for ${connection.imei}:`, parsedResponse);

    // Resolve the oldest pending command
    const pendingCommand = connection.pendingCommands.shift();
    if (pendingCommand) {
      clearTimeout(pendingCommand.timeout);
      pendingCommand.resolve(parsedResponse);
    } else {
      // No pending command, emit event for unsolicited response
      this.emit('response', connection.imei, connection.uuid, parsedResponse);
    }

    return true;
  }

  /**
   * Get list of connected devices
   */
  getConnectedDevices(): string[] {
    return Array.from(this.imeiToUuid.keys());
  }

  /**
   * Get statistics
   */
  getStats(): { connectedDevices: number; pendingCommands: number } {
    let pendingCommands = 0;
    for (const connection of this.connections.values()) {
      pendingCommands += connection.pendingCommands.length;
    }
    return {
      connectedDevices: this.connections.size,
      pendingCommands
    };
  }
}

// Export singleton instance
export const commandManager = new CommandManager();
