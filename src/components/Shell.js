import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Btn, Icon, Sheet, Label, TitleCtx } from './ui';
import BrandLockup from './BrandLockup';
import { BellButton, ProfileCtx, useMyPhoto } from './HomeHeader';
import { useApp, useNav, useUi } from '../lib/app';
import { useNotif } from '../lib/notifications';
import { sb } from '../lib/supabase';
import { classText, uploadLocalFile } from '../lib/helpers';
import { SCREENS } from '../screens';
import { C, F, shadow } from '../theme';

const W = Dimensions.get('window').width;
const SIDE_W = Math.min(310, W * 0.82);

const STUDENT_TABS = [
  ['dashboard', 'house', 'Home'], ['lectures', 'video', 'Lectures'], ['notes', 'note-sticky', 'Notes'], ['homework', 'book-open', 'Homework'], ['more', 'bars', 'More'],
];
const staffTabs = (home) => [
  [home, 'house', 'Home'], ['students', 'users', 'Students'], ['content', 'cloud-arrow-up', 'Content'], ['quiz-manager', 'list-check', 'Quizzes'], ['more', 'bars', 'More'],
];
const STUDENT_MORE = [
  ['lectures', 'video', 'Lectures'], ['notes', 'note-sticky', 'Notes'], ['homework', 'book-open', 'Homework'],
  ['quizzes', 'circle-question', 'Quizzes'], ['notebooklm', 'wand-magic-sparkles', 'AI Study Hub'], ['student-marks', 'file-signature', 'Marks'],
  ['leaderboard', 'ranking-star', 'Leaderboard'], ['notifications', 'bell', 'Notifications'],
];

export default function Shell() {
  const app = useApp();
  const { profile, isStudent, isAdmin } = app;
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [profileOpen, setProfileOpen] = useState(false);
  const meta = SCREENS[nav.current.name] || SCREENS.dashboard;
  const Screen = meta.component;
  const hideChrome = !!meta.fullscreen || nav.immersive;

  const home = isStudent ? 'dashboard' : isAdmin ? 'admin-dashboard' : 'teacher-dashboard';
  const tabs = isStudent ? STUDENT_TABS : staffTabs(home);
  const moreItems = isStudent
    ? STUDENT_MORE
    : [['students', 'users', 'Students'], ['content', 'cloud-arrow-up', 'Content'], ['quiz-manager', 'list-check', 'Quiz Manager'],
       ['lecture-discussions', 'comments', 'Discussions'], ['marks', 'chart-column', 'Marks'], ['leaderboard', 'ranking-star', 'Leaderboard'], ...(isAdmin ? [['teachers', 'chalkboard-user', 'Teachers']] : [])];
  const activeTab = meta.tab || nav.current.name;
  const title = meta.title || '';
  const canBack = !!meta.detail && nav.stack.length > 1;

  const photo = useMyPhoto();

  return (
    <TitleCtx.Provider value={title}>
     <ProfileCtx.Provider value={() => setProfileOpen(true)}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: hideChrome ? 0 : insets.top }}>
        <StatusBar hidden={nav.immersive} barStyle="dark-content" backgroundColor={C.bg} />
        {!hideChrome && !meta.home && (
          <View style={st.top}>
            {canBack ? (
              <Pressable style={st.circ} onPress={() => nav.pop()} hitSlop={6}><Icon name="chevron-left" size={15} /></Pressable>
            ) : isStudent ? (
              <Pressable onPress={() => setProfileOpen(true)} hitSlop={6}><Avatar uri={photo} name={profile?.full_name} size={44} ring /></Pressable>
            ) : (
              <View style={st.circ}><Image source={require('../../assets/logo.png')} style={{ width: 38, height: 38 }} resizeMode="contain" /></View>
            )}
            <Text style={st.topTitle} numberOfLines={1}>{title}</Text>
            {isStudent ? (
              <BellButton onPress={() => nav.current.name !== 'notifications' && nav.push('notifications')} />
            ) : (
              <Pressable onPress={() => nav.setDrawer(true)}><Avatar uri={photo} name={profile?.full_name} size={42} ring /></Pressable>
            )}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Screen params={nav.current.params} nav={nav} key={nav.current.key} />
        </View>
        {!hideChrome && <BottomNav tabs={tabs} active={activeTab} nav={nav} insets={insets} moreActive={activeTab === 'more'} />}
        {!meta.fullscreen && (
          <SideMenu open={nav.drawer} onClose={() => nav.setDrawer(false)} items={moreItems} active={activeTab !== 'more' ? activeTab : nav.current.name} nav={nav} app={app} insets={insets} photo={photo} onProfile={() => { nav.setDrawer(false); setProfileOpen(true); }} />
        )}
        <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} photo={photo} />
      </View>
     </ProfileCtx.Provider>
    </TitleCtx.Provider>
  );
}

/* ---------------- bottom navigation (fixed on every page) ---------------- */
function BottomNav({ tabs, active, nav, insets, moreActive }) {
  const go = (key) => {
    if (key === 'more') return nav.setDrawer(true);
    if (nav.current.name === key) return;
    nav.reset(key);
  };
  return (
    <View style={[st.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map(([key, icon, label]) => {
        const on = key === 'more' ? moreActive : key === active;
        return (
          <Pressable key={key} style={st.tab} onPress={() => go(key)} hitSlop={4}>
            <View style={st.tabIcon}>
              <View style={[st.pill, { opacity: on ? 1 : 0 }]} />
              <Icon name={icon} size={16} color={on ? C.primary : 'rgba(255,255,255,0.75)'} />
            </View>
            <Text style={[st.tabText, on && { color: C.accent, fontFamily: F.s }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- right-side menu (opened by "More") ---------------- */
function SideMenu({ open, onClose, items, active, nav, app, insets, photo, onProfile }) {
  const x = useRef(new Animated.Value(SIDE_W)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const { unread } = useNotif();
  useEffect(() => {
    if (open) setMounted(true);
    Animated.parallel([
      Animated.timing(x, { toValue: open ? 0 : SIDE_W, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: open ? 1 : 0, duration: 260, useNativeDriver: true }),
    ]).start(() => { if (!open) setMounted(false); });
  }, [open]);
  if (!mounted) return null;
  const { profile, student, isStudent } = app;
  const go = (name) => {
    onClose();
    if (name === 'notifications') return nav.current.name !== 'notifications' && nav.push('notifications');
    if (nav.current.name === name) return;
    nav.reset(name);
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(27,20,100,0.5)', opacity: fade }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[st.side, { width: SIDE_W, transform: [{ translateX: x }], paddingBottom: insets.bottom + 10 }]}>
        <View style={[st.sHead, { paddingTop: insets.top + 16 }]}>
          <Image source={require('../../assets/logo.png')} style={st.sLogo} resizeMode="contain" />
          <View style={{ flex: 1 }}><BrandLockup light /></View>
          <Pressable onPress={onClose} hitSlop={10}><Icon name="xmark" size={18} color={C.white} /></Pressable>
        </View>

        <Pressable style={st.user} onPress={onProfile}>
          <Avatar uri={photo} name={profile?.full_name} size={46} ring />
          <View style={{ flex: 1 }}>
            <Text style={st.uName} numberOfLines={1}>{profile?.full_name}</Text>
            <Text style={st.uSub} numberOfLines={1}>
              {isStudent ? `${classText(student?.class_no)} • Roll ${student?.roll_number || '—'}` : app.isAdmin ? 'Administrator' : 'Teacher'} • {profile?.login_id}
            </Text>
          </View>
          <Icon name="chevron-right" size={11} color={C.grey} />
        </Pressable>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          {items.map(([name, icon, label]) => {
            const on = name === active;
            return (
              <Pressable key={name} onPress={() => go(name)} style={[st.item, on && { backgroundColor: C.accent }]}>
                <Icon name={icon} size={16} color={C.primary} />
                <Text style={[st.itemText, on && { fontFamily: F.b }]}>{label}</Text>
                {name === 'notifications' && unread > 0 && <View style={st.pillBadge}><Text style={st.pillBadgeText}>{unread}</Text></View>}
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 12 }}>
          <Pressable style={[st.item, { backgroundColor: C.primaryTint }]} onPress={() => { onClose(); app.signOut(); }}>
            <Icon name="right-from-bracket" size={16} color={C.alert} />
            <Text style={[st.itemText, { color: C.alert }]}>Logout</Text>
          </Pressable>
          <Text style={st.loc}>Kairi Birpur, Dist- Kishanganj, Bihar</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------------- profile sheet (staff can set a photo) ---------------- */
function ProfileSheet({ visible, onClose, photo }) {
  const { profile, student, isStudent, signOut, refreshProfile, session } = useApp();
  const { toast, loading } = useUi();
  const pick = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast('Photo permission is required.', 'error');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return toast('Photo must be 5 MB or smaller.', 'error');
      loading(true, 'Updating profile photo...');
      const path = `staff/${session.user.id}/profile.jpg`;
      await uploadLocalFile('student-photos', path, asset.uri, 'image/jpeg', true);
      const { error } = await sb.rpc('set_my_profile_photo', { p_path: path });
      if (error) throw error;
      await refreshProfile();
      toast('Profile photo updated.', 'success');
    } catch (e) { toast(e.message || 'Could not update profile photo.', 'error'); } finally { loading(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="My profile">
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Avatar uri={photo} name={profile?.full_name} size={84} ring />
        <Text style={st.pName}>{profile?.full_name || 'BCCian'}</Text>
        <Text style={st.pId}>{profile?.login_id || '—'}</Text>
        <Label style={{ marginTop: 2 }}>
          {isStudent ? `${classText(student?.class_no)} • Batch ${student?.batch || '—'}` : profile?.role === 'admin' ? 'Administrator' : 'Teacher'}
        </Label>
      </View>
      {isStudent && (
        <View style={st.info}>
          {[['Student ID', profile?.login_id], ['Class', classText(student?.class_no)], ['Roll number', student?.roll_number], ['Batch', student?.batch], ['Phone', student?.phone]].map(([k, v]) => (
            <View key={k} style={st.infoRow}><Text style={st.infoK}>{k}</Text><Text style={st.infoV}>{v || '—'}</Text></View>
          ))}
        </View>
      )}
      {!isStudent && <Btn label={profile?.photo_path ? 'Replace profile photo' : 'Add profile photo'} icon="camera" kind="soft" full onPress={pick} style={{ marginBottom: 10 }} />}
      <Btn label="Logout" icon="right-from-bracket" kind="danger" full onPress={() => { onClose(); signOut(); }} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  circ: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 17, color: C.primary },
  nav: { flexDirection: 'row', backgroundColor: C.primary, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8, paddingHorizontal: 6, ...shadow, shadowOpacity: 0.25, elevation: 12 },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon: { width: 52, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 16, backgroundColor: C.accent },
  tabText: { fontFamily: F.m, fontSize: 10.5, color: 'rgba(255,255,255,0.75)' },
  side: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: C.white, borderTopLeftRadius: 26, borderBottomLeftRadius: 26, overflow: 'hidden' },
  sHead: { backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sLogo: { width: 60, height: 60 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 12, padding: 12, borderRadius: 16, backgroundColor: C.bg },
  uName: { fontFamily: F.s, fontSize: 13.5, color: C.primary },
  uSub: { fontFamily: F.r, fontSize: 10.5, color: C.grey },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, marginBottom: 4 },
  itemText: { flex: 1, fontFamily: F.m, fontSize: 14.5, color: C.primary },
  pillBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.alert, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pillBadgeText: { color: C.white, fontFamily: F.b, fontSize: 11 },
  loc: { fontFamily: F.r, fontSize: 10.5, color: C.grey, textAlign: 'center', marginTop: 12 },
  info: { backgroundColor: C.bg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  infoK: { fontFamily: F.r, fontSize: 12.5, color: C.grey },
  infoV: { fontFamily: F.s, fontSize: 13, color: C.primary },
  pName: { fontFamily: F.b, fontSize: 18, color: C.primary, marginTop: 10 },
  pId: { fontFamily: F.m, fontSize: 12.5, color: C.grey },
});
