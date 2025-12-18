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
  private pendingResolve: (() => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;

  /**
   * Connect to Asterisk AMI
   */
  async connect(config: AmiConfig): Promise<void> {
    this.config = config;
    this.state = 'connecting';

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      let settled = false;

      // Overall timeout for connection + authentication (15 seconds)
      const overallTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.pendingResolve = null;
          this.pendingReject = null;
          logger.error('AMI: Connection/authentication timeout after 15s');
          reject(new Error('AMI connection/authentication timeout'));
          this.socket?.destroy();
        }
      }, 15000);

      // Safe resolve that can only fire once
      this.pendingResolve = () => {
        if (!settled) {
          settled = true;
          clearTimeout(overallTimeout);
          this.pendingResolve = null;
          this.pendingReject = null;
          resolve();
        }
      };

      // Safe reject that can only fire once
      this.pendingReject = (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(overallTimeout);
          this.pendingResolve = null;
          this.pendingReject = null;
          reject(err);
        }
      };

      this.socket.on('connect', () => {
        logger.info('AMI: TCP connection established', { host: config.host, port: config.port });
        this.state = 'authenticating';
        // Asterisk sends a greeting, then we authenticate
      });

      this.socket.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.socket.on('error', (err) => {
        logger.error('AMI: Socket error', { error: err.message });
        if (this.state === 'connecting' || this.state === 'authenticating') {
          this.pendingReject?.(err);
        }
        this.handleDisconnect();
      });

      this.socket.on('close', () => {
        logger.warn('AMI: Connection closed');
        if (this.state === 'authenticating') {
          this.pendingReject?.(new Error('AMI connection closed during authentication'));
        }
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
  private handleData(data: string): void {
    this.buffer += data;

    // Special case: Asterisk greeting ends with just \r\n, not \r\n\r\n
    // Check for greeting before splitting by \r\n\r\n
    if (this.state === 'authenticating' && this.buffer.startsWith('Asterisk Call Manager')) {
      const greetingEnd = this.buffer.indexOf('\r\n');
      if (greetingEnd !== -1) {
        const greeting = this.buffer.substring(0, greetingEnd);
        this.buffer = this.buffer.substring(greetingEnd + 2);
        logger.debug('AMI: Received greeting', { greeting });
        this.authenticate();
      }
      return;
    }

    // AMI messages are separated by \r\n\r\n
    const messages = this.buffer.split('\r\n\r\n');
    this.buffer = messages.pop() || '';

    for (const message of messages) {
      if (!message.trim()) continue;
      this.parseMessage(message);
    }
  }

  /**
   * Parse an AMI message
   */
  private parseMessage(message: string): void {
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

    // Handle authentication response
    if (event['Response'] === 'Success' && this.state === 'authenticating') {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      logger.info('AMI: Authentication successful, subscribing to events...');
      // Subscribe to call events - CRITICAL: Without this, AMI won't send any events!
      this.sendAction('Events', { EventMask: 'call' });
      this.pendingResolve?.();
      return;
    }

    if (event['Response'] === 'Error' && this.state === 'authenticating') {
      const error = new Error(`AMI authentication failed: ${event['Message']}`);
      logger.error('AMI: Authentication failed', { message: event['Message'] });
      this.pendingReject?.(error);
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

    // Log all AMI events (INFO level to verify subscription is working)
    logger.info('AMI: Event received', { type: eventType, channel: event['Channel'] });

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

      // Log all Hangup event details for debugging correlation issues
      logger.info('AMI: Hangup event received', {
        channel: hangupEvent.channel,
        cause: hangupEvent.cause,
        causeText: hangupEvent.causeText,
        callerIdNum: hangupEvent.callerIdNum,
        connectedLineNum: hangupEvent.connectedLineNum,
        uniqueid: hangupEvent.uniqueid,
      });
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
