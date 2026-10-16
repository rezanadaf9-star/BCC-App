import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { sb } from './supabase';
import { authEmail } from './helpers';
import { C, F, R } from '../theme';

/* ============================== Session / profile ============================== */
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children, onReady }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [student, setStudent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [booting, setBooting] = useState(true);

  const loadIdentity = useCallback(async (userId) => {
    const { data: p, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    if (p?.is_active === false) throw new Error('This account is inactive. Please contact BCC administration.');
    let s = null;
    let cls = [];
    if (p?.role === 'admin') cls = [10, 12];
    else if (p?.role === 'teacher') {
      const a = await sb.from('teacher_class_assignments').select('class_no').eq('teacher_id', userId);
      cls = [...new Set((a.data || []).map((x) => Number(x.class_no)))].sort();
    }
    if (p?.role === 'student') {
      const r = await sb.from('student_profiles').select('*').eq('user_id', userId).single();
      if (r.error) throw r.error;
      s = r.data;
    }
    setProfile(p);
    setStudent(s);
    setClasses(cls);
    return { p, s };
  }, []);

  useEffect(() => {
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    (async () => {
      try {
        const { data } = await withTimeout(sb.auth.getSession(), 6000);
        if (data.session) {
          setSession(data.session);
          await withTimeout(loadIdentity(data.session.user.id), 8000);
        }
      } catch (e) {
        // Slow/offline network: open the login screen instead of hanging. Keep the saved session
        // unless Supabase explicitly rejected it.
        if (e?.message !== 'timeout') { try { await sb.auth.signOut(); } catch (_) {} }
        setSession(null); setProfile(null); setStudent(null); setClasses([]);
      } finally {
        setBooting(false);
        onReady && onReady();
      }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((evt, s) => {
      if (evt === 'SIGNED_OUT') { setSession(null); setProfile(null); setStudent(null); setClasses([]); }
      else if (s) setSession(s);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const signIn = useCallback(async (id, password, portal) => {
    const { data, error } = await sb.auth.signInWithPassword({ email: authEmail(id), password });
    if (error) throw error;
    try {
      const { p } = await loadIdentity(data.session.user.id);
      if (!p) throw new Error('Your account exists, but its BCC profile is missing.');
      if (portal === 'student' && p.role !== 'student') throw new Error('This ID is not a student account.');
      if (portal === 'teacher' && !['teacher', 'admin'].includes(p.role)) throw new Error('This ID is not a teacher account.');
      setSession(data.session);
    } catch (e) {
      await sb.auth.signOut();
      throw e;
    }
  }, [loadIdentity]);

  const signOut = useCallback(async () => {
    try { await sb.auth.signOut(); } catch (_) {}
    setSession(null); setProfile(null); setStudent(null); setClasses([]);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadIdentity(session.user.id);
  }, [session, loadIdentity]);

  const value = useMemo(() => ({
    session, profile, student, booting,
    classNo: student?.class_no ?? null,
    classes,
    isStudent: profile?.role === 'student',
    isAdmin: profile?.role === 'admin',
    isTeacher: profile?.role === 'teacher',
    isStaff: !!profile && profile.role !== 'student',
    signIn, signOut, refreshProfile,
  }), [session, profile, student, classes, booting, signIn, signOut, refreshProfile]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/* ============================== Toast + loader ============================== */
const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }) {
  const [toastMsg, setToastMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const toast = useCallback((message, type = 'info') => {
    clearTimeout(timer.current);
    setToastMsg({ message: String(message || ''), type });
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToastMsg(null));
    }, 3200);
  }, [anim]);
  const loading = useCallback((on, text = 'Loading...') => setBusy(on ? text : null), []);

  const value = useMemo(() => ({ toast, loading }), [toast, loading]);
  return (
    <UiCtx.Provider value={value}>
      {children}
      {toastMsg && (
        <Animated.View
          pointerEvents="none"
          style={[
            st.toast,
            toastMsg.type === 'error' && { backgroundColor: C.alert },
            toastMsg.type === 'success' && { backgroundColor: C.primary, borderColor: C.accent, borderWidth: 1.5 },
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
          ]}
        >
          <Text style={st.toastText}>{toastMsg.message}</Text>
        </Animated.View>
      )}
      {busy && (
        <View style={st.busy}>
          <View style={st.busyCard}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={st.busyText}>{busy}</Text>
          </View>
        </View>
      )}
    </UiCtx.Provider>
  );
}

/* ============================== Navigation ============================== */
const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);

export function NavProvider({ initial, children }) {
  const [stack, setStack] = useState([{ key: 'k0', name: initial, params: {} }]);
  const [drawer, setDrawer] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const guard = useRef(null);
  const counter = useRef(1);

  const mk = (name, params) => ({ key: `k${counter.current++}`, name, params: params || {} });
  const push = useCallback((name, params) => { setDrawer(false); setStack((s) => [...s, mk(name, params)]); }, []);
  const replace = useCallback((name, params) => setStack((s) => [...s.slice(0, -1), mk(name, params)]), []);
  // "reset" = open a main screen. It is added to the history so the phone's Back button returns to the previous screen.
  const reset = useCallback((name, params) => {
    setDrawer(false);
    setStack((s) => {
      const cur = s[s.length - 1];
      if (cur.name === name && !params) return s;
      return [...s, mk(name, params)].slice(-40);
    });
  }, []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const setGuard = useCallback((fn) => { guard.current = fn; }, []);

  const goBack = useCallback(() => {
    if (guard.current && guard.current() === true) return true;
    if (drawer) { setDrawer(false); return true; }
    if (stack.length > 1) { pop(); return true; }
    return false;
  }, [drawer, stack.length, pop]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  const value = useMemo(
    () => ({ stack, current: stack[stack.length - 1], push, pop, replace, reset, drawer, setDrawer, immersive, setImmersive, setGuard, goBack }),
    [stack, drawer, immersive, push, pop, replace, reset, setGuard, goBack]
  );
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

const st = StyleSheet.create({
  toast: {
    position: 'absolute', left: 20, right: 20, bottom: 100, backgroundColor: C.black,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: R.md, zIndex: 999, elevation: 20,
  },
  toastText: { color: C.white, fontFamily: F.m, fontSize: 13, textAlign: 'center' },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(27,20,100,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 998, elevation: 19 },
  busyCard: { backgroundColor: C.white, borderRadius: R.lg, paddingVertical: 22, paddingHorizontal: 30, alignItems: 'center', gap: 10 },
  busyText: { fontFamily: F.s, color: C.primary, fontSize: 13 },
});
