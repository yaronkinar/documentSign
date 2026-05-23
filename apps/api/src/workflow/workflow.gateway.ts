import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { SocketEvents } from '@docflow/shared';
import { getWebOrigins } from '../config/web-origins';

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
  }

  handleDisconnect(_client: Socket): void {
    // socket.io handles room cleanup automatically
  }

  /**
   * Strongly-typed emit. Targets only the per-document room.
   */
  emit<K extends keyof SocketEvents>(event: K, payload: SocketEvents[K]): void {
    if (!this.server) return;
    this.server.to(`doc:${payload.documentId}`).emit(event, payload);
  }
}
