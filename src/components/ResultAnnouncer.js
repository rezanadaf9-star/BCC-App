import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { Icon } from './ui';
import { useApp, useNav } from '../lib/app';
import { sb } from '../lib/supabase';
import { C, F, R } from '../theme';

const { width: W, height: H } = Dimensions.get('window');
const CONFETTI = [C.accent, C.primary, '#E11D48', C.success, '#F59E0B', '#FFFFFF'];

/* ------------------------- confetti (one short burst, native-driven) ------------------------- */
function Confetti({ run }) {
  const pieces = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    key: i,
    x: Math.random() * W,
    drift: (Math.random() - 0.5) * 120,
    size: 6 + Math.random() * 7,
    delay: Math.random() * 500,
    dur: 2200 + Math.random() * 1400,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
    color: CONFETTI[i % CONFETTI.length],
    round: i % 3 === 0,
    v: new Animated.Value(0),
  })), []);
  useEffect(() => {
    if (!run) return undefined;
    const anims = pieces.map((p) => Animated.timing(p.v, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [run]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <Animated.View
          key={p.key}
          style={{
            position: 'absolute', left: p.x, top: -20, width: p.size, height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? p.size / 2 : 2, backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, H * 0.95] }) },
              { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/* ------------------------- the popup card ------------------------- */
function ResultCard({ visible, exam, classNo, onView, onLater }) {
  const scale = useRef(new Animated.Value(0.82)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const soundRef = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;
    scale.setValue(0.82); fade.setValue(0); pop.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.sequence([Animated.delay(180), Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true })]),
    ]).start();
    let dead = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync(require('../../assets/celebration.wav'), { shouldPlay: true, volume: 1.0 });
        if (dead) { sound.unloadAsync().catch(() => {}); return; }
        soundRef.current = sound;
      } catch (_) { /* sound is optional */ }
    })();
    return () => { dead = true; soundRef.current?.unloadAsync().catch(() => {}); soundRef.current = null; };
  }, [visible]);

  if (!exam) return null;
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onLater}>
      <Animated.View style={[st.backdrop, { opacity: fade }]}>
        <Confetti run={visible} />
        <Animated.View style={[st.card, { opacity: fade, transform: [{ scale }] }]}>
          <LinearGradient colors={[C.primary, '#2B2299']} style={st.top}>
            <View style={st.spark1}><Icon name="star" size={12} color={C.accent} /></View>
            <View style={st.spark2}><Icon name="star" size={9} color={C.white} /></View>
            <View style={st.spark3}><Icon name="star" size={10} color={C.accent} /></View>
            <Animated.View style={[st.badge, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] }) }] }]}>
              <Icon name="graduation-cap" size={40} color={C.primary} />
            </Animated.View>
            <View style={st.trophy}><Icon name="trophy" size={16} color={C.accent} /></View>
          </LinearGradient>

          <View style={st.body}>
            <Text style={st.congrats}>🎉 Congratulations!</Text>
            <Text style={st.title}>Your Examination Result Has Been Declared!</Text>
            <Text style={st.text}>You can check your subject-wise marks, overall performance, percentage, and other available result details.</Text>

            <View style={st.info}>
              <View style={st.infoRow}><Text style={st.infoK}>Examination</Text><Text style={st.infoV} numberOfLines={2}>{exam.exam_name}</Text></View>
              <View style={[st.infoRow, { borderBottomWidth: 0 }]}><Text style={st.infoK}>Class</Text><Text style={st.infoV}>{classNo}</Text></View>
            </View>

            <Pressable onPress={onView} style={({ pressed }) => [st.primary, pressed && { opacity: 0.88 }]}>
              <Icon name="chart-simple" size={14} color={C.accent} />
              <Text style={st.primaryT}>View My Result</Text>
            </Pressable>
            <Pressable onPress={onLater} hitSlop={8} style={st.secondary}>
              <Text style={st.secondaryT}>Maybe Later</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Detects newly declared exam results (written by the database trigger into app_notifications,
 * kind = 'result') and shows ONE popup at a time per student. Acknowledgements are stored in
 * result_popup_acks, so a result never pops up twice - even after restart or on another phone.
 */
export default function ResultAnnouncer({ blocked }) {
  const { profile, student, isStudent } = useApp();
  const nav = useNav();
  const [queue, setQueue] = useState([]);              // newest first, shown one by one
  const busy = useRef(false);
  const handled = useRef(new Set());                    // never re-show in the same session

  const check = useCallback(async () => {
    if (!isStudent || !profile || !student || busy.current) return;
    busy.current = true;
    try {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const [n, a] = await Promise.all([
        sb.from('app_notifications').select('id,class_no,ref_id,created_at').eq('kind', 'result').gte('created_at', since).order('created_at', { ascending: false }).limit(10),
        sb.from('result_popup_acks').select('notification_id').eq('user_id', profile.id),
      ]);
      if (n.error || a.error) return; // offline or SQL not run yet: try again later
      const acked = new Set((a.data || []).map((x) => x.notification_id));
      const pending = (n.data || []).filter((x) => !acked.has(x.id) && !handled.current.has(x.id) && x.ref_id && (x.class_no == null || Number(x.class_no) === Number(student.class_no)));
      if (!pending.length) return;
      // only exams that are REALLY declared (drafts / withdrawn results never pop up)
      const ex = await sb.from('academic_exam_sets').select('id,exam_name,class_no,result_declared').in('id', pending.map((x) => x.ref_id)).eq('result_declared', true);
      if (ex.error) return;
      const byId = new Map((ex.data || []).map((e) => [e.id, e]));
      const fresh = pending.filter((x) => byId.has(x.ref_id)).map((x) => ({ note: x, exam: byId.get(x.ref_id) }));
      if (fresh.length) setQueue((q) => [...q, ...fresh.filter((f) => !q.some((o) => o.note.id === f.note.id))]);
    } catch (_) { /* silent */ } finally { busy.current = false; }
  }, [isStudent, profile?.id, student?.class_no]);

  // on open, on resume (offline -> online), every minute while open, and instantly through realtime
  useEffect(() => {
    if (!isStudent || !profile) return undefined;
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    const timer = setInterval(check, 60000);
    const ch = sb.channel(`results-${profile.id}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: 'kind=eq.result' }, () => check())
      .subscribe();
    return () => { sub.remove(); clearInterval(timer); try { sb.removeChannel(ch); } catch (_) {} };
  }, [check, isStudent, profile?.id]);

  const current = !blocked ? queue[0] : null;

  const acknowledge = useCallback(async (action) => {
    const item = queue[0];
    if (!item) return null;
    handled.current.add(item.note.id);
    setQueue((q) => q.slice(1));
    try {
      await sb.from('result_popup_acks').upsert({ user_id: profile.id, notification_id: item.note.id, action }, { onConflict: 'user_id,notification_id', ignoreDuplicates: true });
      await sb.from('notification_reads').upsert({ user_id: profile.id, notification_id: item.note.id }, { onConflict: 'user_id,notification_id', ignoreDuplicates: true });
    } catch (_) { /* offline: it will not repeat in this session; shown again next start until saved */ }
    return item;
  }, [queue, profile?.id]);

  const onView = useCallback(async () => {
    const item = await acknowledge('viewed');
    if (item) nav.reset('student-marks', { openExam: item.exam.id });
  }, [acknowledge, nav]);
  const onLater = useCallback(() => { acknowledge('dismissed'); }, [acknowledge]);

  return <ResultCard visible={!!current} exam={current?.exam} classNo={student?.class_no} onView={onView} onLater={onLater} />;
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,6,50,0.72)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 380, backgroundColor: C.white, borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 24 },
  top: { height: 138, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: 'rgba(255,255,255,0.35)' },
  trophy: { position: 'absolute', right: 74, bottom: 22, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  spark1: { position: 'absolute', left: 52, top: 30 },
  spark2: { position: 'absolute', left: 90, bottom: 26 },
  spark3: { position: 'absolute', right: 56, top: 26 },
  body: { padding: 22, alignItems: 'center' },
  congrats: { fontFamily: F.b, fontSize: 22, color: C.primary },
  title: { fontFamily: F.s, fontSize: 15, color: C.primary, textAlign: 'center', marginTop: 6, lineHeight: 21 },
  text: { fontFamily: F.r, fontSize: 12.5, color: C.grey, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  info: { alignSelf: 'stretch', backgroundColor: C.bg, borderRadius: 16, paddingHorizontal: 14, marginTop: 16, marginBottom: 18 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line },
  infoK: { fontFamily: F.r, fontSize: 12, color: C.grey },
  infoV: { flex: 1, textAlign: 'right', fontFamily: F.s, fontSize: 13, color: C.primary },
  primary: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 16, paddingVertical: 14 },
  primaryT: { fontFamily: F.b, fontSize: 14.5, color: C.white },
  secondary: { paddingVertical: 14, paddingHorizontal: 20, marginTop: 4 },
  secondaryT: { fontFamily: F.s, fontSize: 13, color: C.grey },
});
