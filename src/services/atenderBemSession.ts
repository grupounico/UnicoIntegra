import { getAuthSession, requireAuthSession } from '../utils/authSession';
export function hasAtenderBemSession() { return Boolean(getAuthSession()?.authToken); }
export function atenderBemHeaders() {
  return { Authorization: `Bearer ${requireAuthSession().authToken}` };
}
