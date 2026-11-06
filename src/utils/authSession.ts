const AUTH_COOKIE_KEYS = [
  'authToken',
  'authUsername',
  'authPassword',
  'username',
] as const;

type AuthCookieKey = (typeof AUTH_COOKIE_KEYS)[number];

export interface AuthSession {
  authToken: string;
  authUsername: string;
  authPassword: string;
  username: string;
}

function getCookie(name: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  const value = cookie.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

function setCookie(name: AuthCookieKey, value: string, expiresAt: Date) {
  if (typeof document === 'undefined') {
    return;
  }

  const secureFlag =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';

  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax${secureFlag}`;
}

function deleteCookie(name: AuthCookieKey) {
  if (typeof document === 'undefined') {
    return;
  }

  const secureFlag =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';

  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secureFlag}`;
}

function clearLegacyStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  AUTH_COOKIE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

export function clearAuthSession() {
  AUTH_COOKIE_KEYS.forEach((key) => {
    deleteCookie(key);
  });

  clearLegacyStorage();
}

const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
// Treat the token as expired a little early so no request goes out with a dying session.
const EXPIRY_SKEW_MS = 30 * 1000;
const SESSION_EXPIRED_FLAG = 'integra:session-expired';

// Expiry (ms) of the AtenderBem JWT, or null for an opaque/malformed token.
// Only used to log the user out on time; the backend still validates every token.
export function getTokenExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  // Cookies live no longer than the token itself.
  const tokenExpiry = getTokenExpiry(session.authToken);
  const expiresAt = new Date(Math.min(Date.now() + MAX_SESSION_MS, tokenExpiry ?? Infinity));

  AUTH_COOKIE_KEYS.forEach((key) => {
    setCookie(key, session[key], expiresAt);
  });

  clearLegacyStorage();
  try { window.sessionStorage.removeItem(SESSION_EXPIRED_FLAG); } catch { /* storage unavailable */ }
}

export function getSessionExpiry(): number | null {
  const token = getCookie('authToken');
  return token ? getTokenExpiry(token) : null;
}

// Ends a session that the token's expiry or the backend reported as gone,
// and sends the user to the login screen with a notice.
export function expireAuthSession() {
  clearAuthSession();
  try { window.sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1'); } catch { /* storage unavailable */ }
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.location.replace('/');
  }
}

// Read by the login page to explain why the user landed there; cleared on the next login.
export function hasSessionExpiredNotice() {
  try {
    return window.sessionStorage.getItem(SESSION_EXPIRED_FLAG) === '1';
  } catch {
    return false;
  }
}

export function isSessionExpiredResponse(status: number | undefined, body: unknown) {
  const code = (body as { code?: unknown } | null)?.code;
  return (status === 401 || status === 403) && (code === 'INTEGRA_SESSION_INVALID' || code === 'INTEGRA_SESSION_REQUIRED');
}

export function getAuthSession(): AuthSession | null {
  const session = {
    authToken: getCookie('authToken'),
    authUsername: getCookie('authUsername'),
    authPassword: getCookie('authPassword'),
    username: getCookie('username'),
  };

  const values = Object.values(session);
  const hasAllValues = values.every(Boolean);

  if (!hasAllValues) {
    clearAuthSession();
    return null;
  }

  const expiry = getTokenExpiry(session.authToken as string);
  if (expiry !== null && expiry - EXPIRY_SKEW_MS <= Date.now()) {
    expireAuthSession();
    return null;
  }

  return session as AuthSession;
}

export function requireAuthSession() {
  const session = getAuthSession();

  if (session) {
    return session;
  }

  // An expired token already flagged the notice in getAuthSession; here we only redirect.
  clearAuthSession();
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.location.replace('/');
  }

  throw new Error('Sessao expirada. Faca login novamente.');
}
