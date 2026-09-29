import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayInit } from '@nestjs/websockets';
import type { Namespace } from 'socket.io';
import {
  NOTIFICATIONS_NAMESPACE,
  SOCKET_IO_PATH,
  type AppNotification,
  type NotificationServerEvents,
} from '@gen-ui/shared';
import { AuthService } from '../auth/auth.service.js';

/** The browser sends nothing on this namespace; it only listens. */
type NotificationsNamespace = Namespace<Record<string, never>, NotificationServerEvents>;

/**
 * Real-time notifications over WebSockets (Socket.IO). Every signed-in tab
 * keeps one socket open, and the server pushes to it the moment something
 * happens — the browser never polls.
 *
 * A socket is authenticated once, when it connects: its handshake carries the
 * same access token the REST calls send (`auth: { token }`), checked the same
 * way. A refused socket gets `connect_error` in the browser. Signing out
 * closes the socket.
 *
 * `websocket` is the only transport: no HTTP long-polling fallback, and no
 * cookies involved, so no cross-site socket hijacking either.
 */
@WebSocketGateway({ namespace: NOTIFICATIONS_NAMESPACE, path: SOCKET_IO_PATH, transports: ['websocket'] })
export class NotificationsGateway implements OnGatewayInit<NotificationsNamespace> {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  private namespace: NotificationsNamespace;

  constructor(private readonly auth: AuthService) {}

  afterInit(namespace: NotificationsNamespace): void {
    // Runs for every connection attempt, before the socket joins.
    namespace.use((socket, next) => {
      const token: unknown = socket.handshake.auth.token;
      this.auth
        .userFromAccessToken(typeof token === 'string' ? token : '')
        .then(() => next())
        .catch(() => next(new Error('Unauthorized')));
    });
    this.logger.log(`Notifications socket on ${SOCKET_IO_PATH} (namespace ${NOTIFICATIONS_NAMESPACE})`);
  }

  /** Is anyone connected? Lets a producer skip work nobody would see. */
  hasListeners(): boolean {
    return this.namespace.sockets.size > 0;
  }

  /** Pushes one notification to every signed-in tab. */
  broadcast(notification: AppNotification): void {
    this.namespace.emit('notification', notification);
  }
}
