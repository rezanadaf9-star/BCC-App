import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { sb } from './supabase';

/**
 * Device-session management (BCC_DEVICE_SESSION_MANAGEMENT.sql).
 * Platform is always 'android' here, so the app never uses a website (browser) slot.
 * A newer login silently replaces the OLDEST active session of the same platform (server side);
 * the replaced phone notices through realtime / polling and signs itself out.
 */
export const DEVICE_PLATFORM = 'android';
const deviceLabel = () => `BCC Android app (API ${Platform.Version})`;
const missingFn = (e) => /42883|PGRST202|could not find the function|schema cache/i.test(`${e?.code || ''} ${e?.message || ''}`);

/** session_id claim of the current Supabase access token (identifies this exact login). */
export function jwtSessionId(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = new Uint8Array(decode(b64));
    let json = '';
    for (let i = 0; i < bytes.length; i += 1) json += String.fromCharCode(bytes[i]);
    return JSON.parse(json).session_id || null;
  } catch (_) { return null; }
}

/** 'ok' | 'revoked' | 'unavailable' (SQL not installed) | 'error' (network etc. - keep the session) */
export async function registerDeviceSession() {
  try {
    const { error } = await sb.rpc('bcc_register_device_session', { p_platform: DEVICE_PLATFORM, p_device_label: deviceLabel() });
    if (!error) return 'ok';
    if (/replaced|sign in again/i.test(error.message || '')) return 'revoked';
    if (missingFn(error)) return 'unavailable';
    return 'error';
  } catch (_) { return 'error'; }
}

/** 'active' | 'revoked' | 'unknown' (offline / not installed -> never sign the user out by mistake) */
export async function validateDeviceSession() {
  try {
    const { data, error } = await sb.rpc('bcc_is_device_session_active', { p_platform: DEVICE_PLATFORM });
    if (error) return 'unknown';
    if (data === true) return 'active';
    // false = revoked OR a login that was never registered (older app version): registering tells them apart
    const r = await registerDeviceSession();
    return r === 'revoked' ? 'revoked' : r === 'ok' ? 'active' : 'unknown';
  } catch (_) { return 'unknown'; }
}

export async function logoutDeviceSession() {
  try { await sb.rpc('bcc_logout_device_session'); } catch (_) { /* offline: server will replace it later */ }
}
