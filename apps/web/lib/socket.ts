'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { SocketEvents } from '@docflow/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type EventHandlers = {
  [K in keyof SocketEvents]?: (payload: SocketEvents[K]) => void;
};

/**
 * Connects a socket.io client to the API and joins the per-document room.
 * Subscribes to all provided handlers. Returns the socket instance.
 *
 * Usage:
 *   useDocumentSocket(documentId, {
 *     'signer:signed': (p) => ...,
 *     'comment:added': (p) => ...,
 *   });
 */
export function useDocumentSocket(
  documentId: string | null,
  handlers: EventHandlers,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!documentId) return;

    const socket: Socket = io(API_URL, {
      query: { documentId },
      transports: ['websocket'],
      withCredentials: true,
    });

    const subscriptions: Array<keyof SocketEvents> = [
      'document:status_changed',
      'step:completed',
      'signer:signed',
      'signer:rejected',
      'comment:added',
      'comment:resolved',
    ];

    for (const event of subscriptions) {
      socket.on(event, (payload: unknown) => {
        const handler = handlersRef.current[event];
        if (handler) {
          // Type-narrow via cast - SocketEvents discriminates payloads by key.
          (handler as (p: unknown) => void)(payload);
        }
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [documentId]);
}
