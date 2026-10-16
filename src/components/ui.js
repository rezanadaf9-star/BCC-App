import React, { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, shadow } from '../theme';
import { initials, rankLabel, num } from '../lib/helpers';

export const TitleCtx = createContext('');

export const Icon = ({ name, size = 16, color = C.primary, solid = true, style }) => (
  <FontAwesome6 name={name} size={size} color={color} solid={solid} style={style} />
);

export function Page({ children, onRefresh, refreshing = false, style, bottom = 28 }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ padding: 16, paddingBottom: bottom }, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export const Card = ({ children, style, onPress }) =>
  onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}>{children}</Pressable>
  ) : (
    <View style={[s.card, style]}>{children}</View>
  );

export function Head({ title, sub, right }) {
  const screenTitle = useContext(TitleCtx);
  const dup = !!title && String(title).trim().toLowerCase() === String(screenTitle || '').trim().toLowerCase();
  if (dup && !sub && !right) return null;
  return (
    <View style={s.head}>
      <View style={{ flex: 1 }}>
        {!dup && !!title && <Text style={s.h1}>{title}</Text>}
        {!!sub && <Text style={[s.sub, dup && { marginTop: 0 }]}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}
export const Bar = ({ value = 0, color = C.primary, style }) => (
  <View style={[s.barTrack, style]}>
    <View style={[s.barFill, { backgroundColor: color, width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }]} />
  </View>
);
const TONES = { lav: C.lav, mint: C.mint, blush: C.blush, sun: C.sun, white: C.white };
export function Tile({ icon, tone = 'lav', title, value, sub, onPress, style, progress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, { backgroundColor: TONES[tone] || C.lav, opacity: pressed ? 0.85 : 1 }, style]}>
      <View style={s.tileIcon}><Icon name={icon} size={14} color={C.accent} /></View>
      <Text style={s.tileValue} numberOfLines={1}>{value}</Text>
      <Text style={s.tileTitle} numberOfLines={1}>{title}</Text>
      {!!sub && <Text style={s.tileSub} numberOfLines={2}>{sub}</Text>}
      {progress != null && <Bar value={progress} style={{ marginTop: 8 }} />}
    </Pressable>
  );
}
export const SectionTitle = ({ children, right }) => (
  <View style={s.secRow}>
    <Text style={s.sec}>{children}</Text>
    {right}
  </View>
);
export const Label = ({ children, style }) => <Text style={[s.mini, style]}>{children}</Text>;

export function Btn({ label, onPress, icon, kind = 'primary', small, disabled, style, full }) {
  const bg = kind === 'primary' ? C.primary : kind === 'yellow' ? C.accent : kind === 'danger' ? C.alert : kind === 'soft' ? C.soft : C.white;
  const fg = kind === 'primary' || kind === 'danger' ? C.white : C.primary;
  const border = kind === 'ghost' ? C.primary : 'transparent';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn, small && s.btnSm, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        full && { alignSelf: 'stretch' }, style,
      ]}
    >
      {!!icon && <Icon name={icon} size={small ? 12 : 14} color={fg} />}
      <Text style={[s.btnText, small && { fontSize: 12 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export const Pill = ({ text, active, danger }) => (
  <View style={[s.pill, active && { backgroundColor: C.accent }, danger && { backgroundColor: C.alert }]}>
    <Text style={[s.pillText, danger && { color: C.white }]}>{text}</Text>
  </View>
);

export function Avatar({ uri, name, size = 44, ring }) {
  const [failed, setFailed] = useState(false);
  const base = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[base, s.avatar, ring && { borderWidth: 2.5, borderColor: C.primary }]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={base} onError={() => setFailed(true)} />
      ) : (
        <Text style={{ fontFamily: F.b, color: C.primary, fontSize: size * 0.36 }}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function Field({ label, hint, secure, style, inputStyle, multiline, right, ...rest }) {
  const [hide, setHide] = useState(!!secure);
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {!!label && <Text style={s.fieldLabel}>{label}</Text>}
      <View style={[s.inputWrap, multiline && { alignItems: 'flex-start' }]}>
        <TextInput
          placeholderTextColor="#8a8a8a"
          secureTextEntry={hide}
          multiline={multiline}
          autoCapitalize="none"
          {...rest}
          style={[s.input, multiline && { minHeight: 84, textAlignVertical: 'top' }, inputStyle]}
        />
        {secure && (
          <Pressable onPress={() => setHide(!hide)} hitSlop={10}>
            <Icon name={hide ? 'eye' : 'eye-slash'} solid={false} size={16} color={C.grey} />
          </Pressable>
        )}
        {right}
      </View>
      {!!hint && <Text style={[s.mini, { marginTop: 4 }]}>{hint}</Text>}
    </View>
  );
}

export function Select({ label, value, options, onChange, placeholder = 'Select', style }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => String(o.value) === String(value));
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {!!label && <Text style={s.fieldLabel}>{label}</Text>}
      <Pressable style={s.inputWrap} onPress={() => setOpen(true)}>
        <Text style={[s.input, { paddingVertical: 13, color: cur ? C.black : '#8a8a8a' }]} numberOfLines={1}>{cur ? cur.label : placeholder}</Text>
        <Icon name="chevron-down" size={12} color={C.grey} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || 'Select'} compact>
        {options.map((o) => {
          const on = String(o.value) === String(value);
          return (
            <Pressable key={String(o.value)} onPress={() => { onChange(o.value); setOpen(false); }} style={[s.opt, on && { backgroundColor: C.soft }]}>
              <Text style={[s.optText, on && { fontFamily: F.s }]}>{o.label}</Text>
              {on && <Icon name="check" size={14} />}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children, footer, compact }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[s.sheet, compact && { maxHeight: '60%' }]}>
          <View style={s.grab} />
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={s.close}><Icon name="xmark" size={15} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>{children}</ScrollView>
          {footer && <View style={s.sheetFoot}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const Empty = ({ icon = 'inbox', title, text }) => (
  <View style={s.empty}>
    <View style={s.emptyIcon}><Icon name={icon} size={22} /></View>
    {!!title && <Text style={s.emptyTitle}>{title}</Text>}
    {!!text && <Text style={s.emptyText}>{text}</Text>}
  </View>
);

export const Loading = ({ text }) => (
  <View style={{ padding: 40, alignItems: 'center' }}>
    <ActivityIndicator size="large" color={C.primary} />
    {!!text && <Text style={[s.mini, { marginTop: 10 }]}>{text}</Text>}
  </View>
);

/** Renders loading / error / content from a useAsync result. */
export function Async({ q, children }) {
  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data)
    return (
      <View>
        <Empty icon="triangle-exclamation" title="Could not load this page" text={q.error.message} />
        <View style={{ alignItems: 'center' }}><Btn label="Try again" icon="rotate-right" onPress={q.reload} /></View>
      </View>
    );
  return children(q.data);
}

export function ListItem({ title, sub, right, onPress, left }) {
  return (
    <Card onPress={onPress} style={s.li}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={s.liTitle}>{title}</Text>
        {!!sub && <Text style={s.liSub}>{sub}</Text>}
      </View>
      {right}
    </Card>
  );
}

export const Stat = ({ icon, label, value, sub, style }) => (
  <View style={[s.stat, style]}>
    <View style={s.statIcon}><Icon name={icon} size={15} color={C.accent} /></View>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={s.statValue}>{value}</Text>
    {!!sub && <Text style={s.statSub}>{sub}</Text>}
  </View>
);

export const Row = ({ children, style }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;

export const YouBadge = () => (
  <View style={s.you}><Text style={{ fontFamily: F.b, fontSize: 9, color: C.primary }}>YOU</Text></View>
);

/* ------------- Podium + ranked list (quiz & academic) ------------- */
// 1st = centre & tallest (gold), 2nd = left (silver), 3rd = right & shortest (bronze)
const POD = {
  0: { h: 222, colors: ['#F8E07A', '#DDB033'], av: 74, crown: 40 },
  1: { h: 186, colors: ['#CFD7E2', '#96A3B7'], av: 62, crown: 32 },
  2: { h: 158, colors: ['#DAA971', '#AE6F37'], av: 62, crown: 32 },
};
const GOLD_RING = '#E4C53C';
export function Podium({ rows, currentId, academic, admin }) {
  const top = (rows || []).slice(0, 3);
  if (!top.length) return <Empty icon="ranking-star" title="No ranked students yet" text="The leaderboard appears after results are available." />;
  return (
    <View style={s.podium}>
      {[1, 0, 2].map((i) => {
        const r = top[i];
        if (!r) return <View key={`e${i}`} style={s.podCol} />;
        const d = POD[i];
        const me = !admin && r.student_id === currentId;
        const score = academic ? `${r.total_score} / ${r.total_full_marks}` : `${r.score ?? r.total_score ?? 0} / ${r.total_marks ?? 0}`;
        const pct = r.percentage != null ? Number(r.percentage) : Number(r.total_marks) ? (Number(r.score ?? r.total_score ?? 0) / Number(r.total_marks)) * 100 : 0;
        const overlap = d.av * 0.5;
        return (
          <View key={r.student_id || i} style={s.podCol}>
            <Image source={require('../../assets/crown.png')} style={{ alignSelf: 'center', width: d.crown * 1.3, height: d.crown, marginBottom: -3, zIndex: 3 }} resizeMode="contain" />
            <View style={{ alignSelf: 'center', zIndex: 3, elevation: 4, marginBottom: -overlap }}>
              <View style={{ width: d.av + 8, height: d.av + 8, borderRadius: (d.av + 8) / 2, backgroundColor: GOLD_RING, alignItems: 'center', justifyContent: 'center' }}>
                <Avatar uri={r.photo_url} name={r.full_name} size={d.av} />
              </View>
            </View>
            <LinearGradient colors={d.colors} style={[s.podBlock, { height: d.h, paddingTop: overlap + 8 }]}>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.podName} numberOfLines={2}>{r.full_name || 'Student'}</Text>
                {me && <View style={{ marginTop: 3 }}><YouBadge /></View>}
                <Text style={s.podScore}>{score}</Text>
                <Text style={s.podPct}>{num(pct)}%</Text>
              </View>
              <View style={s.podFoot}>
                <Text style={s.podNum}>{i + 1}</Text>
                <Text style={s.podRank}>{rankLabel(i + 1).toUpperCase()}</Text>
              </View>
            </LinearGradient>
          </View>
        );
      })}
    </View>
  );
}

export function RankList({ rows, currentId, academic, admin }) {
  const all = rows || [];
  const at = (r, i) => ({ r, pos: i + 4 });
  let visible;
  if (admin) visible = all.slice(3).map(at);
  else {
    // positions 4..10; if the student is 11th or lower they replace the 10th row
    visible = all.slice(3, 10).map(at);
    const meIdx = all.findIndex((r) => r.student_id === currentId);
    if (meIdx >= 10) visible = [...all.slice(3, 9).map(at), { r: all[meIdx], pos: meIdx + 1 }];
  }
  if (!visible.length) return null;
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
      {visible.map(({ r, pos }, i) => {
        const me = !admin && r.student_id === currentId;
        const score = academic ? `${r.total_score} / ${r.total_full_marks}` : `${r.score ?? r.total_score ?? 0} / ${r.total_marks ?? 0}`;
        const pct = r.percentage != null ? Number(r.percentage) : Number(r.total_marks) ? (Number(r.score ?? r.total_score ?? 0) / Number(r.total_marks)) * 100 : 0;
        return (
          <View key={r.student_id || i} style={[s.rankRow, me && { backgroundColor: C.accent }]}>
            <Text style={s.rankNum}>{rankLabel(pos)}</Text>
            <Avatar uri={r.photo_url} name={r.full_name} size={36} ring={me} />
            <View style={{ flex: 1 }}>
              <Text style={s.liTitle} numberOfLines={1}>{r.full_name || 'Student'}{me ? '  (You)' : ''}</Text>
              <Text style={[s.liSub, me && { color: C.primary }]}>{academic ? `Roll ${r.roll_number || '—'}` : r.login_id || ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.liTitle, { fontSize: 13 }]}>{score}</Text>
              <Text style={[s.liSub, { color: C.primary, fontFamily: F.s }]}>{num(pct)}%</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(27,20,100,0.05)', ...shadow },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(27,20,100,0.12)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  tile: { width: '48.5%', borderRadius: R.md, padding: 14, marginBottom: 12 },
  tileIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tileValue: { fontFamily: F.b, fontSize: 22, color: C.primary },
  tileTitle: { fontFamily: F.s, fontSize: 12.5, color: C.primary },
  tileSub: { fontFamily: F.r, fontSize: 10.5, color: C.grey, marginTop: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  h1: { fontFamily: F.b, fontSize: 20, color: C.primary },
  sub: { fontFamily: F.r, fontSize: 12.5, color: C.grey, marginTop: 2, lineHeight: 18 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 10 },
  sec: { fontFamily: F.b, fontSize: 16, color: C.primary },
  mini: { fontFamily: F.r, fontSize: 11.5, color: C.grey },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5 },
  btnSm: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { fontFamily: F.s, fontSize: 13.5 },
  pill: { backgroundColor: C.soft, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20 },
  pillText: { fontFamily: F.s, fontSize: 10.5, color: C.primary },
  avatar: { backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fieldLabel: { fontFamily: F.m, fontSize: 12.5, color: C.primary, marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: F.r, fontSize: 14, color: C.black, paddingVertical: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(27,20,100,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  sheetTitle: { flex: 1, fontFamily: F.b, fontSize: 17, color: C.primary },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  sheetFoot: { padding: 12, borderTopWidth: 1, borderColor: C.line, flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  opt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  optText: { fontFamily: F.m, fontSize: 14, color: C.black },
  empty: { alignItems: 'center', padding: 28 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { fontFamily: F.b, fontSize: 15, color: C.primary, textAlign: 'center' },
  emptyText: { fontFamily: F.r, fontSize: 12.5, color: C.grey, textAlign: 'center', marginTop: 4 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liTitle: { fontFamily: F.s, fontSize: 14, color: C.primary },
  liSub: { fontFamily: F.r, fontSize: 11.5, color: C.grey, marginTop: 1 },
  stat: { flex: 1, backgroundColor: C.lav, borderRadius: R.md, padding: 14 },
  statIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statLabel: { fontFamily: F.r, fontSize: 11.5, color: C.grey },
  statValue: { fontFamily: F.b, fontSize: 21, color: C.primary, marginTop: 2 },
  statSub: { fontFamily: F.m, fontSize: 10.5, color: C.grey, marginTop: 2 },
  you: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginTop: 8 },
  podCol: { flex: 1, alignItems: 'stretch' },
  podName: { fontFamily: F.b, fontSize: 12, color: C.primary, textAlign: 'center', paddingHorizontal: 4, lineHeight: 16 },
  podScore: { fontFamily: F.m, fontSize: 12, color: 'rgba(17,17,17,0.55)', marginTop: 4 },
  podPct: { fontFamily: F.m, fontSize: 11, color: 'rgba(17,17,17,0.7)' },
  podBlock: { width: '100%', borderTopLeftRadius: 26, borderTopRightRadius: 26, alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, overflow: 'hidden' },
  podFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  podNum: { fontFamily: F.b, fontSize: 30, color: C.white, lineHeight: 34 },
  podRank: { fontFamily: F.s, fontSize: 11, color: C.white, marginBottom: 5, letterSpacing: 0.8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: C.line },
  rankNum: { width: 36, fontFamily: F.b, fontSize: 13, color: C.primary },
});
