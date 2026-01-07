import { Socket, createServer } from 'net';
import { listenForDevice } from './listenForDevice';
import { randomUUID } from 'crypto';
import { AVL_Data, Data, GPRS, ProtocolParser } from 'complete-teltonika-parser';
import EventEmitter = require('events');
import { commandManager } from './CommandManager';
import { isCodec12Response, parseCodec12Response } from './Codec12';
import { securityManager } from './SecurityManager';
import { deviceManager } from './DeviceManager';


var emitter = new EventEmitter();
export interface ISocketOptions {
	"port": Number;
};

export class UdpServerManager extends EventEmitter {

	public conf: ISocketOptions;
	
	public sockets: { [id: string]: { 'imei': string; 'data': ProtocolParser[]; 'socket': Socket; 'ip': string }; };

	constructor(configuration: ISocketOptions) {
		super();
		this.conf = configuration;
		this.sockets = {};
		this.startServer(this.conf.port);
	}

	sendMqttMessage(imei: string, uuid:string, content: AVL_Data) {
		this.emit("message", imei, uuid, content);
	}
	
	sendCommandResponse(imei: string, uuid: string, response: string) {
		this.emit("commandResponse", imei, uuid, response);
	}
	
	deviceConnected(imei: string, uuid: string, socket: Socket, ip: string) {
		// Register with CommandManager for bidirectional commands
		commandManager.registerDevice(imei, uuid, socket);
		// Register with SecurityManager
		securityManager.registerDeviceConnection(ip, imei);
		this.emit("connected", imei, uuid);
	}

	startServer(port: Number) {
		const server = createServer();

		server.on('connection', (sock: Socket) => {
			const clientIp = sock.remoteAddress || 'unknown';
			var uuid = randomUUID();
			
			// Security: Validate connection attempt
			const connValidation = securityManager.validateConnection(clientIp);
			if (!connValidation.allowed) {
				deviceManager.log('warn', 'TCP', `Connection rejected from ${clientIp}: ${connValidation.reason}`);
				sock.destroy();
				return;
			}
			
			deviceManager.log('info', 'TCP', `New connection from ${clientIp}, UUID: ${uuid}`);
			
			sock.on("data", (data: Buffer) => {
				// First check if this is a Codec 12 response
				if (isCodec12Response(data)) {
					deviceManager.log('debug', 'Codec12', `Response received for UUID ${uuid}`);
					const handled = commandManager.handlePossibleResponse(uuid, data);
					if (handled) {
						// Also emit event for MQTT publishing
						const parsed = parseCodec12Response(data);
						if (parsed.success && this.sockets[uuid]) {
							this.sendCommandResponse(this.sockets[uuid].imei, uuid, parsed.response || '');
						}
						return;
					}
				}
				
				let deviceData = listenForDevice(data);
				if (deviceData.Content == undefined && deviceData.Imei != undefined) {
					// Security: Validate IMEI
					const imeiValidation = securityManager.validateImei(deviceData.Imei);
					if (!imeiValidation.valid) {
						deviceManager.log('warn', 'Security', `IMEI rejected: ${deviceData.Imei} - ${imeiValidation.reason}`);
						// Send rejection (0x00) and close connection
						sock.write(new Uint8Array([0]));
						sock.destroy();
						return;
					}
					
					// Security: Check devices per IP limit
					const finalConnValidation = securityManager.validateConnection(clientIp, deviceData.Imei);
					if (!finalConnValidation.allowed) {
						deviceManager.log('warn', 'Security', `Connection limit exceeded for IP ${clientIp}`);
						sock.write(new Uint8Array([0]));
						sock.destroy();
						return;
					}
					
					this.sockets[uuid] = { 'imei': deviceData.Imei, data: [], 'socket': sock, 'ip': clientIp };
					
					// Accept connection (0x01)
					sock.write(new Uint8Array([1]));
					deviceManager.log('info', 'TCP', `Device ${deviceData.Imei} authenticated from ${clientIp}`);

					if(deviceData.Imei != undefined){
						this.deviceConnected(deviceData.Imei, uuid, sock, clientIp);
					}
				} 
				if (deviceData.Content != undefined && deviceData.Imei == undefined) {
					if (deviceData.Imei != undefined) {
						throw new Error("this shouldnt happen");
					} else {
						deviceData.Imei = this.sockets[uuid].imei;
					}
					// Implement codec-checking here

					if (deviceData.Content.CodecType == "data sending") {
						deviceData.Content.Content = deviceData.Content.Content as Data
					} else {
						deviceData.Content.Content = deviceData.Content.Content as GPRS
					}

					if (this.sockets[uuid].imei != undefined && deviceData.Content != undefined) {

						if ('AVL_Datas' in deviceData.Content.Content) {
							// set the type of element to AVL_Data

							deviceData.Content.Content.AVL_Datas.sort((a: AVL_Data, b: AVL_Data) => {return a.Timestamp.getTime() - b.Timestamp.getTime()}).forEach((element: AVL_Data) => {
								this.sendMqttMessage(this.sockets[uuid].imei, uuid, element);
							});
						}
						else{
							// This means that this data is a response to a GPRS command (SMS). This is where you would implement 
							// the logic for handling the response to the command.
						// this.sendMqttMessage(this.sockets[uuid].imei, uuid, deviceData.Content.Content);
						}
					}
					//TODO: Remove this when done with developing 
					// this.sockets[uuid].data.push(deviceData.Content);

					const dataReceivedPacket = Buffer.alloc(4);
					dataReceivedPacket.writeUInt32BE(deviceData.Content.Quantity1);
					sock.write(dataReceivedPacket);
				}

				// console.log(this.sockets);
			});

			sock.on('close', (err: Boolean) => {
				if(this.sockets[uuid] == undefined) return;
				const socketData = this.sockets[uuid];
				// Unregister from CommandManager
				commandManager.unregisterDevice(uuid);
				// Unregister from SecurityManager
				securityManager.unregisterDeviceConnection(socketData.ip, socketData.imei);
				this.deviceDisconnected(socketData.imei)
				delete this.sockets[uuid];
			});
			sock.on("error", (err) => {
				deviceManager.log('error', 'TCP', `Socket error: ${err.name}`);
				if(this.sockets[uuid]) {
					const socketData = this.sockets[uuid];
					// Unregister from CommandManager
					commandManager.unregisterDevice(uuid);
					// Unregister from SecurityManager
					securityManager.unregisterDeviceConnection(socketData.ip, socketData.imei);
					delete this.sockets[uuid];
				}
				// for some reason it goes back to close, make sure to handle this
			});
		});
		server.listen(Number(port), '0.0.0.0', () => {
			deviceManager.log('info', 'TCP', `Listening on all interfaces on port: ${port}`);
		});
	}
	deviceDisconnected(imei: string) {
		this.emit("disconnected", imei);
	}
	
	/**
	 * Get socket by IMEI for sending commands
	 */
	getSocketByImei(imei: string): Socket | undefined {
		for (const uuid in this.sockets) {
			if (this.sockets[uuid].imei === imei) {
				return this.sockets[uuid].socket;
			}
		}
		return undefined;
	}
}

export {emitter};
