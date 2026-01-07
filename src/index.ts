import {
  GPRS,
  ProtocolParser,
  Data,
  AVL_Data,
} from "complete-teltonika-parser";
import { UdpServerManager } from "./UdpServerManager";
import { readFileSync } from "fs";
import { IClientOptions, IConnackPacket, MqttClient, connect } from "mqtt";
import moment = require("moment");
import { commandManager } from "./CommandManager";
import { deviceManager } from "./DeviceManager";
import { WebApiServer } from "./WebApiServer";
// import dotenv
import * as dotenv from 'dotenv';
let out = dotenv.config({ path: process.cwd()+'/.env' });

interface orOptions {
  realm: string;
  teltonika_keyword: string;
  dataTopic: string;
  commandTopic: string;
}

const dataTopic = (opts: orOptions, uuid: string, imei: string) => {
  return `${opts.realm}/${uuid}/${opts.teltonika_keyword}/${imei}/${opts.dataTopic}`;
};
const commandTopic = (opts: orOptions, uuid: string, imei: string) => {
  return `${opts.realm}/${uuid}/${opts.teltonika_keyword}/${imei}/${opts.commandTopic}`;
};

var clients: { [imei: string]: { client: MqttClient; uuid: string } } = {};

var opts = {
  orOpts: {
	realm: process.env.orOpts__realm || 'master',
	teltonika_keyword: process.env.orOpts__teltonika_keyword || 'teltonika',
	dataTopic: process.env.orOpts__dataTopic || 'data',
	commandTopic: process.env.orOpts__commandTopic || 'commands',
  } as orOptions,
  mqttOptions: {
	host: process.env.mqttOptions__host || 'localhost',
	port: parseInt(process.env.mqttOptions__port || '1883'),
    protocol: process.env.mqttOptions__protocol || 'mqtt'
  },
  udp_options: {
	port: parseInt(process.env.udpServerOptions__port || '8833')
  },
  webApi: {
    port: parseInt(process.env.WEB_API_PORT || '3000'),
    host: process.env.WEB_API_HOST || '0.0.0.0'
  }
};

// Start Web API Server
const webApi = new WebApiServer(opts.webApi);
webApi.start();

deviceManager.log('info', 'Main', 'Starting Teltonika Codec Server');
deviceManager.log('info', 'Main', `TCP Port: ${opts.udp_options.port}`);
deviceManager.log('info', 'Main', `MQTT Broker: ${opts.mqttOptions.host}:${opts.mqttOptions.port}`);

const server = new UdpServerManager(opts.udp_options);

// Handle AVL data messages
server.on("message", (imei: string, uuid: string, content: AVL_Data) => {
  deviceManager.log('debug', 'AVL', `Data from ${imei}: ${content.IOelement.ElementCount} elements`);
  
  // Update device manager with position
  deviceManager.updatePosition(imei, {
    lat: content.GPSelement.Latitude,
    lng: content.GPSelement.Longitude,
    altitude: content.GPSelement.Altitude,
    speed: content.GPSelement.Speed,
    angle: content.GPSelement.Angle,
    satellites: content.GPSelement.Satellites,
    timestamp: content.Timestamp
  });
  
  var mqttMsg = processAvlData(content);
  
  if (!clients[imei] || !clients[imei].client.connected) {
    deviceManager.log('warn', 'MQTT', `Not connected to broker for ${imei}`);
    return;
  }
  
  clients[imei].client.publish(
    dataTopic(opts.orOpts, uuid, imei),
    JSON.stringify(mqttMsg)
  );
});

// Handle command responses (Codec 12)
server.on("commandResponse", (imei: string, uuid: string, response: string) => {
  deviceManager.log('info', 'Codec12', `Response from ${imei}: ${response}`);
  
  if (clients[imei] && clients[imei].client.connected) {
    const responseMsg = {
      state: {
        reported: {
          command_response: response,
          ts: moment().valueOf()
        }
      }
    };
    clients[imei].client.publish(
      dataTopic(opts.orOpts, uuid, imei),
      JSON.stringify(responseMsg)
    );
  }
});

// Handle device connection
server.on("connected", (imei: string, uuid: string) => {
  deviceManager.log('info', 'Device', `Connected: ${imei}`);
  deviceManager.registerDevice(imei, uuid);
  
  const clientOptions: IClientOptions = opts.mqttOptions as IClientOptions;
  clientOptions["clientId"] = `teltonika_${imei}_${Date.now()}`;
  const client: MqttClient = connect(clientOptions as IClientOptions);
  
  client.on('connect', () => {
    deviceManager.log('info', 'MQTT', `Connected for device ${imei}`);
    
    // Subscribe to command topic for this device
    const cmdTopic = commandTopic(opts.orOpts, uuid, imei);
    client.subscribe(cmdTopic, (err) => {
      if (err) {
        deviceManager.log('error', 'MQTT', `Error subscribing to ${cmdTopic}`, err);
      } else {
        deviceManager.log('info', 'MQTT', `Subscribed to: ${cmdTopic}`);
      }
    });
    
    // Subscribe to data topic
    client.subscribe(dataTopic(opts.orOpts, uuid, imei));
  });
  
  // Handle incoming MQTT messages (commands)
  client.on('message', async (topic: string, message: Buffer) => {
    const cmdTopic = commandTopic(opts.orOpts, uuid, imei);
    
    if (topic === cmdTopic) {
      const command = message.toString().trim();
      deviceManager.log('info', 'MQTT', `Command for ${imei}: "${command}"`);
      
      if (command && command.length > 0) {
        try {
          // Send command via Codec 12
          const response = await commandManager.sendCommand(imei, command);
          
          if (response.success) {
            deviceManager.log('info', 'Codec12', `Command success for ${imei}: ${response.response}`);
          } else {
            deviceManager.log('error', 'Codec12', `Command failed for ${imei}: ${response.error}`);
            // Publish error to data topic
            const errorMsg = {
              state: {
                reported: {
                  command_error: response.error,
                  command_sent: command,
                  ts: moment().valueOf()
                }
              }
            };
            client.publish(dataTopic(opts.orOpts, uuid, imei), JSON.stringify(errorMsg));
          }
        } catch (error) {
          deviceManager.log('error', 'Codec12', `Error sending command to ${imei}`, error);
        }
      }
    }
  });
  
  client.on('error', (err) => {
    deviceManager.log('error', 'MQTT', `Error for device ${imei}`, err);
  });
  
  clients[imei] = { client: client, uuid: uuid };
});

server.on("disconnected", (imei: string) => {
  deviceManager.log('info', 'Device', `Disconnected: ${imei}`);
  deviceManager.unregisterDevice(imei);
  
  if (clients[imei]) {
    clients[imei].client.end();
    delete clients[imei];
  }
});

function processAvlData(avlData: AVL_Data) {
  var params: { [avlid: number | string]: number | string } =
    avlData.IOelement.Elements;

  var parsedParams: { [avlid: number | string]: number | string } = {};

  parsedParams["latlng"] = `${avlData.GPSelement.Latitude},${avlData.GPSelement.Longitude}`;
  parsedParams["ts"] = moment(avlData.Timestamp).valueOf();
  parsedParams["alt"] = `${avlData.GPSelement.Altitude}`;
  parsedParams["ang"] = `${avlData.GPSelement.Angle}`;
  parsedParams["sat"] = `${avlData.GPSelement.Satellites}`;
  parsedParams["sp"] = `${avlData.GPSelement.Speed}`;
  parsedParams["evt"] = `${avlData.IOelement.EventID != undefined ? avlData.IOelement.EventID : 0}`;

  //ISSUE: The parser parses the axis data incorrectly, resulting in an integer overflow
  //TODO: Investigate potential fixes
  for (let key in params) {
    parsedParams[key] = params[key];
  }

  return { state: { reported: parsedParams } };
}

function extractValue(x: string) {
  var y: number | string = parseInt(x, 16);
  if (y > Number.MAX_SAFE_INTEGER) {
    y = BigInt(`0x${x}`).toString();
  }
  return y;
}
