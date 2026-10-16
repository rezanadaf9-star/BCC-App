import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { sb } from './supabase';
import { useApp, useNav } from './app';

/**
 * Supabase tables used (see supabase/APP_FEATURES.sql):
 *   app_notifications  (id, class_no, kind, title, body, ref_id, ref_subject_id, created_by, created_at)
 *   notification_reads (user_id, notification_id, read_at)
 * If the tables do not exist yet the app simply shows 0 notifications.
 */
const Ctx = createContext({ unread: 0, items: [], loading: false, refresh: async () => {}, markRead: async () => {}, markAllRead: async () => {} });
export const useNotif = () => useContext(Ctx);

export function NotifProvider({ children }) {
  const { profile, isStudent } = useApp();
  const nav = useNav();
  const [items, setItems] = useState([]);
  const [reads, setReads] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!isStudent || !profile) return;
    try {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [n, r] = await Promise.all([
        sb.from('app_notifications').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(60),
        sb.from('notification_reads').select('notification_id').eq('user_id', profile.id),
      ]);
      if (!alive.current) return;
      if (n.error) { setItems([]); setReads(new Set()); return; } // table missing / no access -> 0
      setItems(n.data || []);
      setReads(new Set((r.data || []).map((x) => x.notification_id)));
    } catch (_) {
      /* keep previous state */
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [isStudent, profile?.id]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { refresh(); }, [refresh, nav.current.key]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const markRead = useCallback(async (id) => {
    if (!id || reads.has(id)) return;
    setReads((p) => new Set([...p, id]));
    await sb.from('notification_reads').upsert({ user_id: profile.id, notification_id: id }, { onConflict: 'user_id,notification_id', ignoreDuplicates: true });
  }, [reads, profile?.id]);

  const markAllRead = useCallback(async () => {
    const ids = items.filter((x) => !reads.has(x.id)).map((x) => x.id);
    if (!ids.length) return;
    setReads((p) => new Set([...p, ...ids]));
    await sb.from('notification_reads').upsert(ids.map((id) => ({ user_id: profile.id, notification_id: id })), { onConflict: 'user_id,notification_id', ignoreDuplicates: true });
  }, [items, reads, profile?.id]);

  const value = useMemo(() => ({
    items: items.map((x) => ({ ...x, read: reads.has(x.id) })),
    unread: items.filter((x) => !reads.has(x.id)).length,
    loading, refresh, markRead, markAllRead,
  }), [items, reads, loading, refresh, markRead, markAllRead]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Teacher/admin side: call after saving new content so students get a notification. Never throws. */
export async function notify({ classNo, kind, title, body, refId, refSubjectId }) {
  try {
    await sb.from('app_notifications').insert({
      class_no: classNo ?? null, kind, title, body: body || null, ref_id: refId || null, ref_subject_id: refSubjectId || null,
    });
  } catch (_) { /* notifications are best-effort */ }
}
