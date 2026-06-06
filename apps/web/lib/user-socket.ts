'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { UserSocketEvents } from '@docflow/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type UserSocketHandlers = {
  [K in keyof UserSocketEvents]?: (payload: UserSocketEvents[K]) => void;
};

/**
 * Connects to the API user room for in-app notifications.
 */
export function useUserSocket(
  clerkId: string | null,
  handlers: UserSocketHandlers,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!clerkId) return;

    const socket: Socket = io(API_URL, {
      query: { userId: clerkId },
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('notification:new', (payload: unknown) => {
      handlersRef.current['notification:new']?.(
        payload as UserSocketEvents['notification:new'],
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [clerkId]);
}
