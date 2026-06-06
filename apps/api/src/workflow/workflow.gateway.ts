import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { SocketEvents, UserNotificationDto, UserSocketEvents } from '@docflow/shared';
import { getWebOrigins } from '../config/web-origins';

/** Socket events broadcast to a document room (`doc:${documentId}`). */
type DocumentRoomEvent = Exclude<keyof SocketEvents, 'notification:new'>;

@Injectable()
@WebSocketGateway({
  cors: {
    origin: getWebOrigins(),
    credentials: true,
  },
})
export class WorkflowGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    const documentId = client.handshake.query.documentId;
    if (typeof documentId === 'string' && documentId) {
      client.join(`doc:${documentId}`);
    }
    const userId = client.handshake.query.userId;
    if (typeof userId === 'string' && userId) {
      client.join(`user:${userId}`);
    }
  }

  handleDisconnect(_client: Socket): void {
    // socket.io handles room cleanup automatically
  }

  /**
   * Strongly-typed emit. Targets only the per-document room.
   */
  emit<K extends DocumentRoomEvent>(event: K, payload: SocketEvents[K]): void {
    if (!this.server) return;
    this.server.to(`doc:${payload.documentId}`).emit(event, payload);
  }

  /** Push an in-app notification to a signed-in user's personal room. */
  emitToUser(clerkId: string, notification: UserNotificationDto): void {
    if (!this.server || !clerkId) return;
    const payload: UserSocketEvents['notification:new'] = { notification };
    this.server.to(`user:${clerkId}`).emit('notification:new', payload);
  }
}
