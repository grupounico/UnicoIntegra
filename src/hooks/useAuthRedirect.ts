import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuthSession, getAuthSession, getSessionExpiry } from '../utils/authSession';

export function useRequireAuth(redirectTo = '/') {
  const navigate = useNavigate();

  useEffect(() => {
    const validateSession = () => {
      if (getAuthSession()) {
        return;
      }

      clearAuthSession();
      navigate(redirectTo, { replace: true });
    };

    validateSession();
    window.addEventListener('focus', validateSession);

    return () => {
      window.removeEventListener('focus', validateSession);
    };
  }, [navigate, redirectTo]);
}

export function useRedirectIfAuthenticated(redirectTo = '/main') {
  const navigate = useNavigate();

  useEffect(() => {
    if (getAuthSession()) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);
}

// Logs the user out as soon as the AtenderBem token expires: on a timer, and
// again whenever the tab regains focus (timers are throttled in background tabs).
export function useSessionExpiryWatch() {
  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      if (!getAuthSession()) return; // getAuthSession expires and redirects
      const expiry = getSessionExpiry();
      if (expiry === null) return;
      // setTimeout caps at ~24.8 days; tokens are far shorter, but stay safe.
      timer = window.setTimeout(check, Math.min(Math.max(expiry - 30_000 - Date.now(), 1000), 2_000_000_000));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
