/**
 * GPS Webhook Forwarder
 * Sends GPS data to external sistema_gps via HTTP POST
 */

import { deviceManager } from "./DeviceManager";

interface GPSData {
    imei: string;
    latitude: number;
    longitude: number;
    speed: number;
    heading: number;
    altitude: number;
    timestamp: Date;
    satellites?: number;
    metadata?: Record<string, any>;
}

interface WebhookConfig {
    url: string;
    apiKey?: string;
    enabled: boolean;
    timeout: number;
}

class GPSWebhookForwarder {
    private config: WebhookConfig;
    private queue: GPSData[] = [];
    private isProcessing: boolean = false;
    private failureCount: number = 0;
    private maxRetries: number = 3;

    constructor() {
        this.config = {
            url: process.env.GPS_WEBHOOK_URL || '',
            apiKey: process.env.GPS_WEBHOOK_API_KEY || '',
            enabled: process.env.GPS_WEBHOOK_ENABLED === 'true',
            timeout: parseInt(process.env.GPS_WEBHOOK_TIMEOUT || '5000'),
        };

        if (this.config.enabled && this.config.url) {
            deviceManager.log('info', 'Webhook', `GPS Webhook enabled: ${this.config.url}`);
        } else if (this.config.enabled) {
            deviceManager.log('warn', 'Webhook', 'GPS Webhook enabled but no URL configured');
        }
    }

    updateConfig(newConfig: Partial<WebhookConfig>) {
        this.config = { ...this.config, ...newConfig };
        deviceManager.log('info', 'Webhook', `Config updated: ${this.config.url}`);
    }

    isEnabled(): boolean {
        return this.config.enabled && !!this.config.url;
    }

    async forwardGPSData(data: GPSData): Promise<boolean> {
        if (!this.isEnabled()) {
            return false;
        }

        // Add to queue
        this.queue.push(data);

        // Process queue
        if (!this.isProcessing) {
            await this.processQueue();
        }

        return true;
    }

    private async processQueue(): Promise<void> {
        if (this.queue.length === 0 || this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const data = this.queue.shift();
            if (!data) continue;

            try {
                await this.sendToWebhook(data);
                this.failureCount = 0;
            } catch (error) {
                this.failureCount++;
                deviceManager.log('error', 'Webhook', `Failed to send GPS data: ${(error as Error).message}`);

                // Re-queue if under retry limit
                if (this.failureCount < this.maxRetries) {
                    this.queue.unshift(data);
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000 * this.failureCount));
                } else {
                    deviceManager.log('error', 'Webhook', `Max retries reached, dropping data for ${data.imei}`);
                    this.failureCount = 0;
                }
            }
        }

        this.isProcessing = false;
    }

    private async sendToWebhook(data: GPSData): Promise<void> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (this.config.apiKey) {
                headers['X-API-Key'] = this.config.apiKey;
            }

            const response = await fetch(this.config.url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    imei: data.imei,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    speed: data.speed,
                    heading: data.heading,
                    altitude: data.altitude,
                    timestamp: data.timestamp.toISOString(),
                    satellites: data.satellites,
                    metadata: data.metadata,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            deviceManager.log('debug', 'Webhook', `Sent GPS data for ${data.imei}`);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    getStatus(): { enabled: boolean; url: string; queueSize: number; failureCount: number } {
        return {
            enabled: this.isEnabled(),
            url: this.config.url,
            queueSize: this.queue.length,
            failureCount: this.failureCount,
        };
    }
}

export const gpsWebhook = new GPSWebhookForwarder();
