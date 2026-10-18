import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../lib/app';
import { sb } from '../lib/supabase';
import { jwtSessionId, validateDeviceSession } from '../lib/session';

/**
 * Signs this phone out as soon as a newer login replaced its session:
 *  - instantly through realtime (bcc_device_sessions UPDATE of my own session),
 *  - when the app opens / returns to the foreground / reconnects,
 *  - every 30 seconds while the app is open.
 * Offline checks are ignored (never a false sign-out); revoked sessions are also blocked server-side by RLS.
 */
export default function SessionGuard() {
  const { profile, session, forceSignOut } = useApp();
  const busy = useRef(false);

  useEffect(() => {
    if (!profile) return undefined;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try { if ((await validateDeviceSession()) === 'revoked') await forceSignOut(); } finally { busy.current = false; }
    };
    check();
    const timer = setInterval(check, 30000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });

    let channel = null;
    (async () => {
      const { data } = await sb.auth.getSession();
      const sid = jwtSessionId(data?.session?.access_token);
      if (!sid) return;
      channel = sb.channel(`session-${sid.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bcc_device_sessions', filter: `user_id=eq.${profile.id}` }, (payload) => {
          const row = payload?.new;
          if (row && row.auth_session_id === sid && row.revoked_at) forceSignOut();
        })
        .subscribe();
    })();

    return () => { clearInterval(timer); sub.remove(); if (channel) { try { sb.removeChannel(channel); } catch (_) {} } };
  }, [profile?.id, session?.access_token ? 1 : 0]);

  return null;
}
