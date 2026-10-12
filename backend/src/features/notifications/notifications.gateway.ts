import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import {
  NOTIFICATIONS_NAMESPACE,
  SOCKET_IO_PATH,
  type AppNotification,
  type NotificationServerEvents,
} from '@gen-ui/shared';
import { AuthService } from '../auth/auth.service.js';

/** What the handshake learned about a socket: whose it is. */
interface SocketData {
  userId: string;
}

/** The browser sends nothing on this namespace; it only listens. */
type NotificationsNamespace = Namespace<Record<string, never>, NotificationServerEvents, DefaultEventsMap, SocketData>;
type NotificationsSocket = Socket<Record<string, never>, NotificationServerEvents, DefaultEventsMap, SocketData>;

/** Every tab of one user shares a room. */
const roomOf = (userId: string) => `user:${userId}`;

/**
 * Real-time notifications over WebSockets (Socket.IO). Every signed-in tab
 * keeps one socket open, and the server pushes a notification to its user's
 * tabs the moment it is stored — the browser never polls.
 *
 * A socket is authenticated once, when it connects: its handshake carries the
 * same access token the REST calls send (`auth: { token }`), checked the same
 * way, and the socket joins its user's room. A refused socket gets
 * `connect_error` in the browser. Signing out closes the socket.
 *
 * `websocket` is the only transport: no HTTP long-polling fallback, and no
 * cookies involved, so no cross-site socket hijacking either.
 */
@WebSocketGateway({ namespace: NOTIFICATIONS_NAMESPACE, path: SOCKET_IO_PATH, transports: ['websocket'] })
export class NotificationsGateway
  implements OnGatewayInit<NotificationsNamespace>, OnGatewayConnection<NotificationsSocket>
{
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
        .then((user) => {
          socket.data.userId = user.id;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });
    this.logger.log(`Notifications socket on ${SOCKET_IO_PATH} (namespace ${NOTIFICATIONS_NAMESPACE})`);
  }

  /** Runs once the middleware let the socket in. */
  handleConnection(socket: NotificationsSocket): void {
    void socket.join(roomOf(socket.data.userId));
  }

  /** Is anyone connected? Lets a producer skip work nobody would see. */
  hasListeners(): boolean {
    return this.namespace.sockets.size > 0;
  }

  /** Pushes one notification to every open tab of one user. */
  sendTo(userId: string, notification: AppNotification): void {
    this.namespace.to(roomOf(userId)).emit('notification', notification);
  }
}
