/**
 * Admin WebSocket Server
 *
 * Provides real-time log streaming to admin clients.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { RequestHandler } from 'express';
import crypto from 'crypto';
import { getConfig } from '../config/index.js';
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
  private sessionMiddleware?: RequestHandler;

  constructor(server: HttpServer, sessionMiddleware?: RequestHandler, path: string = '/admin/ws') {
    this.sessionMiddleware = sessionMiddleware;
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
   * Verify client connection by validating the admin session cookie.
   *
   * Runs the express-session middleware against the upgrade request so the signed
   * `admin.sid` cookie is unsigned and resolved against the session store, then
   * requires an authenticated, non-expired admin session. Without this, any client
   * reaching /admin/ws could subscribe to the live OTP event stream (phone numbers,
   * fraud scores, shadow-ban flags) with no authentication.
   */
  private verifyClient(
    info: { origin: string; req: IncomingMessage; secure: boolean },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    if (!this.sessionMiddleware) {
      // Fail closed: without a session validator we cannot authenticate the client.
      logger.error('WebSocket connection rejected: session middleware not configured');
      callback(false, 503, 'Session validation unavailable');
      return;
    }

    // Minimal response stub - the session middleware only reads the request cookie
    // and loads the session; it never writes a response during the handshake.
    const stubRes = {
      setHeader: () => {},
      getHeader: () => undefined,
      removeHeader: () => {},
      writeHead: () => {},
      end: () => {},
      on: () => {},
      once: () => {},
      emit: () => {},
    } as unknown as ServerResponse;

    try {
      this.sessionMiddleware(info.req as never, stubRes as never, () => {
        const session = (info.req as IncomingMessage & {
          session?: { adminAuthenticated?: boolean; loginTimestamp?: number };
        }).session;

        if (!session?.adminAuthenticated) {
          callback(false, 401, 'Unauthorized');
          return;
        }

        // Enforce the same session TTL as the REST middleware.
        const ttlMs = getConfig().admin.sessionTtlMinutes * 60 * 1000;
        const age = Date.now() - (session.loginTimestamp || 0);
        if (age > ttlMs) {
          callback(false, 401, 'Session expired');
          return;
        }

        callback(true);
      });
    } catch (error) {
      logger.error('WebSocket session validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      callback(false, 401, 'Unauthorized');
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = crypto.randomUUID();
    const client = ws as AuthenticatedWebSocket;

    client.clientId = clientId;
    client.isAuthenticated = true; // Validated in verifyClient (session cookie) before reaching here
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

    // Handle pong responses (browser responds to ping with pong)
    ws.on('pong', () => {
      client.lastPing = Date.now();
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
   * Broadcast OTP request status update
   */
  broadcastOtpUpdate(update: {
    id: string;
    status: string;
    channel?: string;
    channel_status?: string;
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
export function initializeWebSocket(
  server: HttpServer,
  sessionMiddleware?: RequestHandler
): AdminWebSocketServer {
  if (!wsServerInstance) {
    wsServerInstance = new AdminWebSocketServer(server, sessionMiddleware);
  }
  return wsServerInstance;
}

/**
 * Get the WebSocket server instance
 */
export function getWebSocketServer(): AdminWebSocketServer | null {
  return wsServerInstance;
}
