'use client';

import axios from 'axios';
import { useAuthStore } from '@/src/store/authStore';

function normalizeApiBaseUrl(value?: string) {
  const configured = value?.trim().replace(/\/+$/, '');
  if (!configured || configured === '/ap') return '/api';
  return configured;
}

const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('collabboard_token') : undefined;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error?.config?.url ?? '');
    const isAuthAttempt = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

    if (error?.response?.status === 401 && typeof window !== 'undefined' && !isAuthAttempt) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

export type ApiErrorMessageOptions = {
  // Appends "(status, METHOD /path)" to the message. Useful for surfaces aimed
  // at a developer running the app locally (e.g. "API not reachable" states),
  // but it's leaky, technical noise for a normal user-facing form error like a
  // failed login — set this to false for those call sites.
  includeRequestDetails?: boolean;
};

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
  options: ApiErrorMessageOptions = {},
) {
  const { includeRequestDetails = true } = options;

  if (!axios.isAxiosError(error)) return fallback;

  const data = error.response?.data as any;
  const message = data?.message;
  const status = error.response?.status;
  const method = error.config?.method?.toUpperCase();
  const url = getRequestUrl(error);
  const requestSummary = includeRequestDetails ? [method, url].filter(Boolean).join(' ') : '';

  const serverMessage =
    typeof message === 'string'
      ? message
      : Array.isArray(message)
        ? message.join(' ')
        : message && typeof message === 'object' && typeof message.error === 'string'
          ? message.error
          : typeof data?.error === 'string'
            ? data.error
            : undefined;

  if (status === 404) {
    if (data?.error !== 'route_not_found' && serverMessage) {
      return includeRequestDetails
        ? `${serverMessage} (404${requestSummary ? `, ${requestSummary}` : ''})`
        : serverMessage;
    }
    if (!includeRequestDetails) {
      return serverMessage ?? fallback;
    }
    return [
      'API route not found (404).',
      requestSummary ? `Request: ${requestSummary}.` : undefined,
      'Check NEXT_PUBLIC_API_URL; for the Docker Nginx setup use /api, then rebuild or restart the frontend.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (!error.response) {
    if (!includeRequestDetails) {
      return 'Could not reach the API server. Please try again.';
    }
    return [
      'Could not reach the API server.',
      requestSummary ? `Request: ${requestSummary}.` : undefined,
      'Make sure the API is running and NEXT_PUBLIC_API_URL points to it.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (serverMessage) {
    if (!includeRequestDetails) return serverMessage;
    return status ? `${serverMessage} (${status}${requestSummary ? `, ${requestSummary}` : ''})` : serverMessage;
  }

  if (!includeRequestDetails) return fallback;
  return status ? `${fallback} (${status}${requestSummary ? `, ${requestSummary}` : ''})` : fallback;
}

function getRequestUrl(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;

  try {
    return api.getUri({
      baseURL: error.config?.baseURL,
      url: error.config?.url,
      params: error.config?.params,
    });
  } catch {
    return error.config?.url;
  }
}
