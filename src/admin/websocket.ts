/**
 * Admin WebSocket Server
 *
 * Provides real-time log streaming to admin clients.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

interface AuthenticatedWebSocket extends WebSocket {
  clientId: string;
  isAuthenticated: boolean;
  subscriptions: Set<string>;
  lastPing: number;
}

interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: unknown;
}

/**
 * Admin WebSocket Server
 */
export class AdminWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer, path: string = '/admin/ws') {
    this.wss = new WebSocketServer({
      server,
      path,
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });

    // Ping clients every 30 seconds to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    logger.info('Admin WebSocket server initialized', { path });
  }

  /**
   * Verify client connection (session validation would go here)
   */
  private verifyClient(
    _info: { origin: string; req: IncomingMessage; secure: boolean },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    // For now, accept all connections
    // Session validation can be added by parsing cookies from info.req.headers.cookie
    callback(true);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = crypto.randomUUID();
    const client = ws as AuthenticatedWebSocket;

    client.clientId = clientId;
    client.isAuthenticated = true; // Will be validated via session cookie
    client.subscriptions = new Set();
    client.lastPing = Date.now();

    this.clients.set(clientId, client);

    logger.info('WebSocket client connected', {
      clientId,
      ip: req.socket.remoteAddress,
    });

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      data: { clientId },
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(client, message);
      } catch (error) {
        logger.warn('Invalid WebSocket message', { clientId, error });
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info('WebSocket client disconnected', { clientId });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket client error', { clientId, error: error.message });
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: AuthenticatedWebSocket, message: WebSocketMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.channel) {
          client.subscriptions.add(message.channel);
          this.sendToClient(client, {
            type: 'subscribed',
            data: { channel: message.channel },
          });
          logger.debug('Client subscribed', {
            clientId: client.clientId,
            channel: message.channel,
          });
        }
        break;

      case 'unsubscribe':
        if (message.channel) {
          client.subscriptions.delete(message.channel);
          this.sendToClient(client, {
            type: 'unsubscribed',
            data: { channel: message.channel },
          });
        }
        break;

      case 'ping':
        client.lastPing = Date.now();
        this.sendToClient(client, {
          type: 'pong',
          data: { timestamp: Date.now() },
        });
        break;

      default:
        logger.warn('Unknown WebSocket message type', {
          clientId: client.clientId,
          type: message.type,
        });
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  broadcast(channel: string, type: string, data: unknown): void {
    const message = JSON.stringify({ type, data });

    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel) && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast new OTP request to subscribed clients
   */
  broadcastOtpRequest(request: {
    id: string;
    phone: string;
    status: string;
    channel?: string;
    fraud_score: number;
    shadow_banned: number;
    created_at: number;
    country_code?: string;
  }): void {
    this.broadcast('otp-requests', 'otp-request:created', request);
  }

  /**
   * Broadcast OTP request status update
   */
  broadcastOtpUpdate(update: {
    id: string;
    status: string;
    channel?: string;
    updated_at: number;
  }): void {
    this.broadcast('otp-requests', 'otp-request:updated', update);
  }

  /**
   * Ping all connected clients
   */
  private pingClients(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds

    this.clients.forEach((client, clientId) => {
      if (now - client.lastPing > timeout) {
        // Client hasn't responded to pings, terminate
        logger.info('Terminating inactive WebSocket client', { clientId });
        client.terminate();
        this.clients.delete(clientId);
      } else if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close the WebSocket server
   */
  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((client) => {
      client.close();
    });

    this.wss.close();
    logger.info('Admin WebSocket server closed');
  }
}

// Singleton instance
let wsServerInstance: AdminWebSocketServer | null = null;

/**
 * Initialize the WebSocket server
 */
export function initializeWebSocket(server: HttpServer): AdminWebSocketServer {
  if (!wsServerInstance) {
    wsServerInstance = new AdminWebSocketServer(server);
  }
  return wsServerInstance;
}

/**
 * Get the WebSocket server instance
 */
export function getWebSocketServer(): AdminWebSocketServer | null {
  return wsServerInstance;
}
