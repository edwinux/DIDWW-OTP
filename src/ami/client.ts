/**
 * Asterisk Manager Interface (AMI) Client
 *
 * Connects to Asterisk AMI to capture SIP failure events (Hangup events with Q.850 cause codes)
 * that are not visible through ARI alone.
 */

import { EventEmitter } from 'events';
import net from 'net';
import { logger } from '../utils/logger.js';

/**
 * AMI configuration
 */
export interface AmiConfig {
  host: string;
  port: number;
  username: string;
  secret: string;
}

/**
 * AMI Hangup event data
 */
export interface AmiHangupEvent {
  channel: string;
  uniqueid: string;
  cause: number;
  causeText: string;
  callerIdNum?: string;
  connectedLineNum?: string;
}

/**
 * AMI connection states
 */
type AmiState = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

/**
 * AMI Client
 */
export class AmiClient extends EventEmitter {
  private config: AmiConfig | null = null;
  private socket: net.Socket | null = null;
  private state: AmiState = 'disconnected';
  private buffer = '';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 5000;

  /**
   * Connect to Asterisk AMI
   */
  async connect(config: AmiConfig): Promise<void> {
    this.config = config;
    this.state = 'connecting';

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      const connectTimeout = setTimeout(() => {
        reject(new Error('AMI connection timeout'));
        this.socket?.destroy();
      }, 10000);

      this.socket.on('connect', () => {
        clearTimeout(connectTimeout);
        logger.info('AMI: TCP connection established', { host: config.host, port: config.port });
        this.state = 'authenticating';
        // Asterisk sends a greeting, then we authenticate
      });

      this.socket.on('data', (data) => {
        this.handleData(data.toString(), resolve, reject);
      });

      this.socket.on('error', (err) => {
        clearTimeout(connectTimeout);
        logger.error('AMI: Socket error', { error: err.message });
        if (this.state === 'connecting' || this.state === 'authenticating') {
          reject(err);
        }
        this.handleDisconnect();
      });

      this.socket.on('close', () => {
        logger.warn('AMI: Connection closed');
        this.handleDisconnect();
      });

      this.socket.connect(config.port, config.host);
    });
  }

  /**
   * Disconnect from AMI
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.sendAction('Logoff');
      this.socket.destroy();
      this.socket = null;
    }

    this.state = 'disconnected';
    logger.info('AMI: Disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Handle incoming data from AMI
   */
  private handleData(
    data: string,
    connectResolve?: (value: void) => void,
    connectReject?: (reason: Error) => void
  ): void {
    this.buffer += data;

    // AMI messages are separated by \r\n\r\n
    const messages = this.buffer.split('\r\n\r\n');
    this.buffer = messages.pop() || '';

    for (const message of messages) {
      if (!message.trim()) continue;
      this.parseMessage(message, connectResolve, connectReject);
    }
  }

  /**
   * Parse an AMI message
   */
  private parseMessage(
    message: string,
    connectResolve?: (value: void) => void,
    connectReject?: (reason: Error) => void
  ): void {
    const lines = message.split('\r\n');
    const event: Record<string, string> = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        event[key] = value;
      }
    }

    // Handle Asterisk greeting
    if (message.startsWith('Asterisk Call Manager')) {
      this.authenticate();
      return;
    }

    // Handle authentication response
    if (event['Response'] === 'Success' && this.state === 'authenticating') {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      logger.info('AMI: Authentication successful');
      connectResolve?.();
      return;
    }

    if (event['Response'] === 'Error' && this.state === 'authenticating') {
      const error = new Error(`AMI authentication failed: ${event['Message']}`);
      logger.error('AMI: Authentication failed', { message: event['Message'] });
      connectReject?.(error);
      return;
    }

    // Handle events
    if (event['Event']) {
      this.handleEvent(event);
    }
  }

  /**
   * Send authentication action
   */
  private authenticate(): void {
    if (!this.config) return;

    this.sendAction('Login', {
      Username: this.config.username,
      Secret: this.config.secret,
    });
  }

  /**
   * Send an AMI action
   */
  private sendAction(action: string, params: Record<string, string> = {}): void {
    if (!this.socket) return;

    let message = `Action: ${action}\r\n`;
    for (const [key, value] of Object.entries(params)) {
      message += `${key}: ${value}\r\n`;
    }
    message += '\r\n';

    this.socket.write(message);
  }

  /**
   * Handle an AMI event
   */
  private handleEvent(event: Record<string, string>): void {
    const eventType = event['Event'];

    // We're primarily interested in Hangup events for SIP failure detection
    if (eventType === 'Hangup') {
      const hangupEvent: AmiHangupEvent = {
        channel: event['Channel'] || '',
        uniqueid: event['Uniqueid'] || '',
        cause: parseInt(event['Cause'] || '0', 10),
        causeText: event['Cause-txt'] || '',
        callerIdNum: event['CallerIDNum'],
        connectedLineNum: event['ConnectedLineNum'],
      };

      logger.debug('AMI: Hangup event received', hangupEvent);
      this.emit('hangup', hangupEvent);
    }

    // Emit raw event for extensibility
    this.emit('event', event);
  }

  /**
   * Handle disconnection and schedule reconnect
   */
  private handleDisconnect(): void {
    this.state = 'disconnected';
    this.socket = null;

    if (this.reconnectAttempts < this.maxReconnectAttempts && this.config) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelayMs * Math.min(this.reconnectAttempts, 6);

      logger.info('AMI: Scheduling reconnect', {
        attempt: this.reconnectAttempts,
        delayMs: delay,
      });

      this.reconnectTimer = setTimeout(() => {
        if (this.config) {
          this.connect(this.config).catch((err) => {
            logger.error('AMI: Reconnect failed', { error: err.message });
          });
        }
      }, delay);
    } else {
      logger.error('AMI: Max reconnect attempts reached, giving up');
      this.emit('maxReconnectAttempts');
    }
  }
}

/**
 * Singleton instance
 */
let instance: AmiClient | null = null;

/**
 * Get AMI client instance
 */
export function getAmiClient(): AmiClient {
  if (!instance) {
    instance = new AmiClient();
  }
  return instance;
}

/**
 * Check if AMI client is available and connected
 */
export function isAmiConnected(): boolean {
  return instance?.isConnected() ?? false;
}
