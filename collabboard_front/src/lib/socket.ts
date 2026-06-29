'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token?: string | null) {
  const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('collabboard_token') : null);
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? getDefaultSocketUrl(), {
      autoConnect: false,
      auth: { token: authToken ?? '' },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
  }
  socket.auth = { token: authToken ?? '' };
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

function getDefaultSocketUrl() {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
}
