import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';
import { API_BASE, api } from './api';
import { expireAuthSession, isSessionExpiredResponse } from '../utils/authSession';

// When the Integra backend says the AtenderBem session is gone (expired or
// revoked before its time), end it here and send the user to the login screen.

export function attachSessionGuard(instance: AxiosInstance) {
  instance.interceptors.response.use(undefined, (error: AxiosError) => {
    if (isSessionExpiredResponse(error.response?.status, error.response?.data)) expireAuthSession();
    return Promise.reject(error);
  });
}

function isIntegraApi(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith(API_BASE);
}

let installed = false;

export function installSessionGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  attachSessionGuard(axios);
  attachSessionGuard(api);

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    if ((response.status === 401 || response.status === 403) && isIntegraApi(input)) {
      const body = await response.clone().json().catch(() => null);
      if (isSessionExpiredResponse(response.status, body)) expireAuthSession();
    }
    return response;
  };
}
