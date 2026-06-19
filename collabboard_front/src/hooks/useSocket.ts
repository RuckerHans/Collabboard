'use client';

import { useEffect, useMemo } from 'react';
import { getSocket } from '@/src/lib/socket';
import { useAuthStore } from '@/src/store/authStore';

export function useSocket() {
  const token = useAuthStore((state) => state.token);
  const socket = useMemo(() => (token ? getSocket(token) : null), [token]);
  useEffect(() => {
    if (!socket || socket.connected) return;
    socket.connect();
  }, [socket]);
  return socket;
}
