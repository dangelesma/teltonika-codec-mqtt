/**
 * Codec 12 - Teltonika GPRS Commands Protocol
 * Used for sending commands to devices and receiving responses
 */

export interface Codec12Message {
  codecId: number;
  quantity: number;
  type: number;
  commandSize: number;
  command: string;
}

export interface Codec12Response {
  success: boolean;
  response?: string;
  error?: string;
}

/**
 * CRC-16 IBM/ANSI calculation (polynomial 0xA001)
 */
export function calculateCRC16(data: Buffer): number {
  let crc = 0x0000;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  
  return crc & 0xFFFF;
}

/**
 * Build a Codec 12 command message
 * Structure:
 * - Preamble: 4 bytes (0x00000000)
 * - Data Size: 4 bytes
 * - Codec ID: 1 byte (0x0C)
 * - Command Quantity 1: 1 byte (0x01)
 * - Type: 1 byte (0x05 for command)
 * - Command Size: 4 bytes
 * - Command: X bytes (ASCII)
 * - Command Quantity 2: 1 byte (0x01)
 * - CRC-16: 4 bytes
 */
export function buildCodec12Command(command: string): Buffer {
  const commandBuffer = Buffer.from(command, 'ascii');
  const commandSize = commandBuffer.length;
  
  // Data part: Codec ID (1) + Quantity1 (1) + Type (1) + CommandSize (4) + Command (X) + Quantity2 (1)
  const dataSize = 1 + 1 + 1 + 4 + commandSize + 1;
  
  // Full message: Preamble (4) + DataSize (4) + Data (dataSize) + CRC (4)
  const totalSize = 4 + 4 + dataSize + 4;
  const buffer = Buffer.alloc(totalSize);
  
  let offset = 0;
  
  // Preamble: 4 bytes of zeros
  buffer.writeUInt32BE(0x00000000, offset);
  offset += 4;
  
  // Data Size: 4 bytes
  buffer.writeUInt32BE(dataSize, offset);
  offset += 4;
  
  // Codec ID: 0x0C for Codec 12
  buffer.writeUInt8(0x0C, offset);
  offset += 1;
  
  // Command Quantity 1: 0x01
  buffer.writeUInt8(0x01, offset);
  offset += 1;
  
  // Type: 0x05 for command
  buffer.writeUInt8(0x05, offset);
  offset += 1;
  
  // Command Size: 4 bytes
  buffer.writeUInt32BE(commandSize, offset);
  offset += 4;
  
  // Command: ASCII bytes
  commandBuffer.copy(buffer, offset);
  offset += commandSize;
  
  // Command Quantity 2: 0x01
  buffer.writeUInt8(0x01, offset);
  offset += 1;
  
  // Calculate CRC-16 on the data portion (from Codec ID to Command Quantity 2)
  const dataForCRC = buffer.slice(8, 8 + dataSize);
  const crc = calculateCRC16(dataForCRC);
  
  // CRC-16: 4 bytes (only lower 2 bytes used, upper 2 are zeros)
  buffer.writeUInt32BE(crc, offset);
  
  return buffer;
}

/**
 * Parse a Codec 12 response from device
 * Response structure is similar to command but Type = 0x06
 */
export function parseCodec12Response(data: Buffer): Codec12Response {
  try {
    // Minimum size check: Preamble(4) + DataSize(4) + CodecID(1) + Qty1(1) + Type(1) + CmdSize(4) + Qty2(1) + CRC(4) = 20 bytes minimum
    if (data.length < 20) {
      return { success: false, error: 'Buffer too small for Codec 12 response' };
    }
    
    let offset = 0;
    
    // Read and verify preamble
    const preamble = data.readUInt32BE(offset);
    offset += 4;
    
    if (preamble !== 0x00000000) {
      return { success: false, error: 'Invalid preamble' };
    }
    
    // Read data size
    const dataSize = data.readUInt32BE(offset);
    offset += 4;
    
    // Verify we have enough data
    if (data.length < 8 + dataSize + 4) {
      return { success: false, error: 'Incomplete message' };
    }
    
    // Read Codec ID
    const codecId = data.readUInt8(offset);
    offset += 1;
    
    if (codecId !== 0x0C) {
      return { success: false, error: `Invalid Codec ID: ${codecId}, expected 0x0C` };
    }
    
    // Read Command Quantity 1
    const quantity1 = data.readUInt8(offset);
    offset += 1;
    
    // Read Type (0x06 for response)
    const type = data.readUInt8(offset);
    offset += 1;
    
    if (type !== 0x06) {
      return { success: false, error: `Invalid response type: ${type}, expected 0x06` };
    }
    
    // Read response size
    const responseSize = data.readUInt32BE(offset);
    offset += 4;
    
    // Read response content
    const responseBuffer = data.slice(offset, offset + responseSize);
    const response = responseBuffer.toString('ascii');
    offset += responseSize;
    
    // Read Command Quantity 2
    const quantity2 = data.readUInt8(offset);
    offset += 1;
    
    // Verify quantities match
    if (quantity1 !== quantity2) {
      return { success: false, error: `Quantity mismatch: ${quantity1} != ${quantity2}` };
    }
    
    // Verify CRC
    const receivedCRC = data.readUInt32BE(offset);
    const dataForCRC = data.slice(8, 8 + dataSize);
    const calculatedCRC = calculateCRC16(dataForCRC);
    
    if (receivedCRC !== calculatedCRC) {
      console.warn(`CRC mismatch: received ${receivedCRC}, calculated ${calculatedCRC}`);
      // Continue anyway - some devices may have CRC issues
    }
    
    return { success: true, response };
    
  } catch (error) {
    return { success: false, error: `Parse error: ${error}` };
  }
}

/**
 * Check if a buffer is a Codec 12 response
 */
export function isCodec12Response(data: Buffer): boolean {
  if (data.length < 12) return false;
  
  // Check preamble
  const preamble = data.readUInt32BE(0);
  if (preamble !== 0x00000000) return false;
  
  // Check codec ID at offset 8
  const codecId = data.readUInt8(8);
  if (codecId !== 0x0C) return false;
  
  // Check type at offset 10 (0x06 for response)
  const type = data.readUInt8(10);
  return type === 0x06;
}

/**
 * Check if a buffer is a Codec 12 command (for debugging)
 */
export function isCodec12Command(data: Buffer): boolean {
  if (data.length < 12) return false;
  
  const preamble = data.readUInt32BE(0);
  if (preamble !== 0x00000000) return false;
  
  const codecId = data.readUInt8(8);
  if (codecId !== 0x0C) return false;
  
  const type = data.readUInt8(10);
  return type === 0x05;
}
