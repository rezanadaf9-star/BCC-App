import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Dimensions, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { Icon } from './ui';
import { useApp, useNav } from '../lib/app';
import { sb } from '../lib/supabase';
import { C, F } from '../theme';

const { width: W, height: H } = Dimensions.get('window');
const COLORS = [C.accent, '#FF4D6D', '#2DD4BF', '#7C5CFF', '#FFB020', '#FFFFFF', '#4ADE80'];

/* ---------- one confetti piece that flies on a parabola (gravity) ---------- */
function Piece({ p, t }) {
  // position(t) = v*t + g*t^2   (t: 0 -> 1)
  const x = Animated.multiply(t, p.vx);
  const y = Animated.add(Animated.multiply(t, p.vy), Animated.multiply(Animated.multiply(t, t), p.g));
  return (
    <Animated.View
      style={{
        position: 'absolute', left: p.x0, top: p.y0, width: p.w, height: p.h, backgroundColor: p.color,
        borderRadius: p.round ? p.w / 2 : 2,
        opacity: t.interpolate({ inputRange: [0, 0.04, 0.8, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateX: x }, { translateY: y }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) }],
      }}
    />
  );
}

/* ---------- confetti rain from the top ---------- */
function Rain({ run }) {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    key: i, x0: Math.random() * W, y0: -24, w: 6 + Math.random() * 6, h: i % 2 ? 9 + Math.random() * 9 : 6 + Math.random() * 6,
    vx: (Math.random() - 0.5) * 160, vy: H * 0.35, g: H * 0.62 + Math.random() * 120, spin: (Math.random() > 0.5 ? 1 : -1) * (300 + Math.random() * 600),
    color: COLORS[i % COLORS.length], round: i % 3 === 0, delay: 700 + Math.random() * 1200, dur: 2600 + Math.random() * 1400, t: new Animated.Value(0),
  })), []);
  useEffect(() => {
    if (!run) return undefined;
    const anims = pieces.map((p) => Animated.timing(p.t, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.linear, useNativeDriver: true }));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [run]);
  return <>{pieces.map((p) => <Piece key={p.key} p={p} t={p.t} />)}</>;
}

/* ---------- a party popper: wiggles, POPS, shoots confetti + streamers ---------- */
function Popper({ side, run, delay }) {
  const left = side === 'left';
  const x0 = left ? 34 : W - 34;
  const y0 = H - 96;
  const cone = useRef(new Animated.Value(0)).current;      // wiggle / recoil
  const flash = useRef(new Animated.Value(0)).current;     // burst flash
  const pieces = useMemo(() => Array.from({ length: 34 }, (_, i) => {
    const tilt = 0.2 + Math.random() * 0.65;                    // angle from straight up, leaning towards the screen centre
    const speed = H * (0.38 + Math.random() * 0.34);
    const streamer = i % 4 === 0;
    return {
      key: i, x0, y0, w: streamer ? 4 : 6 + Math.random() * 6, h: streamer ? 22 + Math.random() * 22 : 6 + Math.random() * 7,
      vx: (left ? 1 : -1) * Math.sin(tilt) * speed, vy: -Math.cos(tilt) * speed, g: speed * 0.9 + 140,
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720), color: COLORS[(i + (left ? 0 : 3)) % COLORS.length],
      round: !streamer && i % 3 === 0, dur: 1700 + Math.random() * 900, t: new Animated.Value(0),
    };
  }), []);
  useEffect(() => {
    if (!run) return undefined;
    const wiggle = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(cone, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(cone, { toValue: 0, friction: 3, tension: 160, useNativeDriver: true }),
    ]);
    const boom = Animated.sequence([
      Animated.delay(delay + 160),
      Animated.parallel([
        Animated.sequence([Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }), Animated.timing(flash, { toValue: 0, duration: 360, useNativeDriver: true })]),
        ...pieces.map((p) => Animated.timing(p.t, { toValue: 1, duration: p.dur, easing: Easing.linear, useNativeDriver: true })),
      ]),
    ]);
    wiggle.start(); boom.start();
    return () => { wiggle.stop(); boom.stop(); };
  }, [run]);
  return (
    <>
      {pieces.map((p) => <Piece key={p.key} p={p} t={p.t} />)}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: left ? 4 : W - 68, top: H - 128, width: 64, height: 64, alignItems: 'center', justifyContent: 'center',
          transform: [{ scaleX: left ? 1 : -1 }, { rotate: cone.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-14deg'] }) }, { scale: cone.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
        }}
      >
        <Text style={{ fontSize: 46 }}>{'\u{1F389}'}</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: x0 - 40, top: y0 - 40, width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF6A8',
          opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }), transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.6] }) }] }}
      />
    </>
  );
}

/* ---------- sound: two pops, then fanfare + applause ---------- */
function useCelebrationSound(visible) {
  useEffect(() => {
    if (!visible) return undefined;
    let dead = false;
    const timers = [];
    const sounds = [];
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false, staysActiveInBackground: false });
        const mk = async (src) => { const { sound } = await Audio.Sound.createAsync(src, { shouldPlay: false, volume: 1.0 }); if (dead) { sound.unloadAsync().catch(() => {}); return null; } sounds.push(sound); return sound; };
        const [p1, p2, fan] = await Promise.all([mk(require('../../assets/popper.wav')), mk(require('../../assets/popper.wav')), mk(require('../../assets/celebration.wav'))]);
        const at = (sound, ms) => timers.push(setTimeout(() => sound && sound.playFromPositionAsync(0).catch(() => {}), ms));
        at(p1, 330); at(p2, 560); at(fan, 760); // synced with the two popper bursts
      } catch (_) { /* sound is optional */ }
    })();
    return () => { dead = true; timers.forEach(clearTimeout); sounds.forEach((s) => s.unloadAsync().catch(() => {})); };
  }, [visible]);
}

/* ------------------------- the popup card ------------------------- */
function ResultCard({ visible, exam, classNo, onView, onLater }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useCelebrationSound(visible);

  useEffect(() => {
    if (!visible) return undefined;
    scale.setValue(0.8); fade.setValue(0); logo.setValue(0); pulse.setValue(0); glow.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.sequence([Animated.delay(200), Animated.spring(logo, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true })]),
    ]).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const gl = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1300, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1300, useNativeDriver: true }),
    ]));
    loop.start(); gl.start();
    return () => { loop.stop(); gl.stop(); };
  }, [visible]);

  if (!exam) return null;
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onLater}>
      <Animated.View style={[st.backdrop, { opacity: fade }]}>
        <Animated.View style={[st.card, { opacity: fade, transform: [{ scale }] }]}>
          {/* header */}
          <LinearGradient colors={['#14104F', C.primary, '#2E25A8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.top}>
            <View style={[st.bubble, { width: 170, height: 170, left: -50, top: -60 }]} />
            <View style={[st.bubble, { width: 120, height: 120, right: -30, bottom: -50 }]} />
            <Animated.View style={[st.halo, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.12] }) }] }]} />
            {[['10%', 34, 13, C.accent], ['20%', 100, 9, '#fff'], ['84%', 30, 11, C.accent], ['74%', 96, 8, '#fff']].map(([l, tp, sz, col], i) => (
              <Animated.View key={i} style={{ position: 'absolute', left: l, top: tp, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [1, 0.3] : [0.3, 1] }) }}>
                <Icon name="star" size={sz} color={col} />
              </Animated.View>
            ))}
            <Animated.View style={[st.logoRing, { transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) }] }]}>
              <Image source={require('../../assets/logo.png')} style={st.logo} resizeMode="contain" />
            </Animated.View>
            <View style={st.chip}><Icon name="trophy" size={11} color={C.primary} /><Text style={st.chipT}>RESULT DECLARED</Text></View>
          </LinearGradient>

          {/* body */}
          <View style={st.body}>
            <Text style={st.congrats}>{'\u{1F389}'} Congratulations!</Text>
            <Text style={st.title}>Your Examination Result Has Been Declared!</Text>
            <Text style={st.text}>You can check your subject-wise marks, overall performance, percentage, and other available result details.</Text>

            <View style={st.info}>
              <View style={st.infoRow}>
                <View style={st.infoIc}><Icon name="graduation-cap" size={13} color={C.accent} /></View>
                <View style={{ flex: 1 }}><Text style={st.infoK}>Examination</Text><Text style={st.infoV} numberOfLines={3}>{exam.exam_name}</Text></View>
              </View>
              <View style={[st.infoRow, { borderBottomWidth: 0 }]}>
                <View style={st.infoIc}><Icon name="users" size={12} color={C.accent} /></View>
                <View style={{ flex: 1 }}><Text style={st.infoK}>Class</Text><Text style={st.infoV}>Class {classNo}</Text></View>
              </View>
            </View>

            <Animated.View style={{ alignSelf: 'stretch', transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] }}>
              <Pressable onPress={onView} style={({ pressed }) => [st.primary, pressed && { opacity: 0.9 }]}>
                <Icon name="chart-simple" size={14} color={C.accent} />
                <Text style={st.primaryT}>View My Result</Text>
                <Icon name="arrow-right" size={13} color={C.accent} />
              </Pressable>
            </Animated.View>
            <Pressable onPress={onLater} hitSlop={8} style={st.secondary}><Text style={st.secondaryT}>Maybe Later</Text></Pressable>
          </View>
        </Animated.View>

        {/* celebration layers (above the card, never block touches) */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Rain run={visible} />
          <Popper side="left" run={visible} delay={170} />
          <Popper side="right" run={visible} delay={400} />
        </View>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(8,5,44,0.78)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 390, backgroundColor: C.white, borderRadius: 30, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 26 },
  top: { height: 176, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bubble: { position: 'absolute', borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  halo: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: C.accent },
  logoRing: { width: 112, height: 112, borderRadius: 56, backgroundColor: C.white, borderWidth: 4, borderColor: C.accent, alignItems: 'center', justifyContent: 'center', shadowColor: C.accent, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10 },
  logo: { width: 98, height: 98 },
  chip: { position: 'absolute', bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 12 },
  chipT: { fontFamily: F.b, fontSize: 9.5, letterSpacing: 1.2, color: C.primary },
  body: { padding: 22, paddingTop: 18, alignItems: 'center' },
  congrats: { fontFamily: F.b, fontSize: 24, color: C.primary },
  title: { fontFamily: F.s, fontSize: 15, color: C.primary, textAlign: 'center', marginTop: 6, lineHeight: 22 },
  text: { fontFamily: F.r, fontSize: 12.5, color: C.grey, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  info: { alignSelf: 'stretch', backgroundColor: C.bg, borderRadius: 18, paddingHorizontal: 14, marginTop: 16, marginBottom: 18, borderWidth: 1, borderColor: C.line },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line },
  infoIc: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  infoK: { fontFamily: F.r, fontSize: 11, color: C.grey },
  infoV: { fontFamily: F.s, fontSize: 13.5, color: C.primary, marginTop: 1 },
  primary: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 18, paddingVertical: 15, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  primaryT: { fontFamily: F.b, fontSize: 15, color: C.white },
  secondary: { paddingVertical: 14, paddingHorizontal: 22, marginTop: 4 },
  secondaryT: { fontFamily: F.s, fontSize: 13, color: C.grey },
});
