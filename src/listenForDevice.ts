import { ProtocolParser, parseIMEI, Data, GPRS } from 'complete-teltonika-parser';

export function listenForDevice(response: Buffer) : {'Content': ProtocolParser | undefined, 'Imei': string | undefined, 'Error'?: string} {
    var imei = undefined;
    const packet = response.toString("hex");
    var processedPacket = processPacket(packet)
    return {'Content': processedPacket.dataPacket, 'Imei': processedPacket.imei, 'Error': processedPacket.error};
}

function processPacket (packet: string): { imei?: string; dataPacket?: ProtocolParser; error?: string }  {
    try {
        if (packet.length == 34) {
            return {
                imei: parseIMEI(packet)
            }
        } else {
            // Validate preamble before parsing (must start with 00000000)
            if (!packet.startsWith('00000000')) {
                return {
                    error: `Invalid preamble: ${packet.substring(0, 8)}`
                }
            }
            return { 
                dataPacket: new ProtocolParser(packet)
            }
        }
    } catch (err: any) {
        return {
            error: err.message || 'Unknown parsing error'
        }
    }
}