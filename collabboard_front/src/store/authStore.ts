'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/src/lib/types';
import { disconnectSocket } from '@/src/lib/socket';

type AuthState = {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (token, user) => {
        localStorage.setItem('collabboard_token', token);
        document.cookie = `collabboard_token=${token}; path=/; max-age=604800`;
        set({ token, user });
      },
      setUser: (user) => set({ user }),
      clearAuth: () => {
        localStorage.removeItem('collabboard_token');
        document.cookie = 'collabboard_token=; path=/; max-age=0';
        disconnectSocket();
        set({ token: null, user: null });
      },
    }),
    {
      name: 'collabboard_auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('collabboard_token') : null;
        if (state && token) state.token = token;
      },
    },
  ),
);
