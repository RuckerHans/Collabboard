'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/axios';
import type { AuthResponse, User } from '@/src/lib/types';
import { useAuthStore } from '@/src/store/authStore';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, token, setAuth, setUser, clearAuth } = useAuthStore();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<User>('/auth/me')).data,
    enabled: Boolean(token),
    retry: false,
  });

  const login = useMutation({
    mutationFn: async (body: { email: string; password: string }) => (await api.post<AuthResponse>('/auth/login', body)).data,
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      queryClient.setQueryData(['me'], data.user);
      router.push('/dashboard');
    },
  });

  const register = useMutation({
    mutationFn: async (body: { username: string; email: string; password: string; avatarColor?: string }) =>
      (await api.post<AuthResponse>('/auth/register', body)).data,
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      queryClient.setQueryData(['me'], data.user);
      router.push('/dashboard');
    },
  });

  const logout = () => {
    clearAuth();
    queryClient.clear();
    router.push('/login');
  };

  if (me.data && me.data.id !== user?.id) setUser(me.data);
  return { user: me.data ?? user, token, login, register, logout, isAuthenticated: Boolean(token) };
}
