import React, { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Icon, Pill } from './ui';
import { useApp, useNav } from '../lib/app';
import { useNotif } from '../lib/notifications';
import { greeting, studentPhotoUrl, todayLabel, useAsync } from '../lib/helpers';
import { C, F } from '../theme';

/** Shell provides a function that opens the profile sheet. */
export const ProfileCtx = createContext(() => {});

export function useMyPhoto() {
  const { profile, student, isStudent } = useApp();
  const path = isStudent ? student?.photo_path : profile?.photo_path;
  return useAsync(() => studentPhotoUrl(path), [path]).data || '';
}

export function BellButton({ onPress }) {
  const { unread } = useNotif();
  return (
    <Pressable onPress={onPress} style={st.bell} hitSlop={6}>
      <Icon name="bell" size={17} color={C.primary} />
      {unread > 0 && <View style={st.badge}><Text style={st.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
    </Pressable>
  );
}

/** Home screen header: profile photo, greeting, name, date, notifications. */
export default function HomeHeader() {
  const { profile, isStudent, isAdmin } = useApp();
  const nav = useNav();
  const photo = useMyPhoto();
  const openProfile = useContext(ProfileCtx);
  return (
    <View style={st.row}>
      <Pressable onPress={openProfile}><Avatar uri={photo} name={profile?.full_name} size={54} ring /></Pressable>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={st.hello}>{greeting()}</Text>
        <Text style={st.name} numberOfLines={1}>{profile?.full_name || 'BCCian'}</Text>
        <Text style={st.date}>{todayLabel()}</Text>
      </View>
      {isStudent ? <BellButton onPress={() => nav.push('notifications')} /> : <Pill active text={isAdmin ? 'Admin' : 'Teacher'} />}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  hello: { fontFamily: F.r, fontSize: 11.5, color: C.grey },
  name: { fontFamily: F.b, fontSize: 18, color: C.primary, lineHeight: 24 },
  date: { fontFamily: F.m, fontSize: 11.5, color: C.grey },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E11D1D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.bg },
  badgeText: { color: '#FFFFFF', fontFamily: F.b, fontSize: 10.5, lineHeight: 13 },
});
