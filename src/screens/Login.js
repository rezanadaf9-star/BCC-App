import React, { useRef, useState } from 'react';
import { Animated, Image, StatusBar, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Field, Icon } from '../components/ui';
import PoweredBy from '../components/PoweredBy';
import { useApp, useUi } from '../lib/app';
import { C, F, R, shadow } from '../theme';

export default function Login() {
  const { signIn } = useApp();
  const { toast, loading } = useUi();
  const [portal, setPortal] = useState('student');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const shake = useRef(new Animated.Value(0)).current;
  const pwRef = useRef(null);

  const bump = () =>
    Animated.sequence([-10, 10, -8, 8, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: true }))).start();

  const submit = async () => {
    if (!id.trim() || !pw) { bump(); return toast('Enter your ID and password.', 'error'); }
    loading(true, 'Signing in...');
    try { await signIn(id.trim(), pw, portal); }
    catch (e) { bump(); toast(e.message || 'Login failed.', 'error'); }
    finally { loading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar backgroundColor={C.primary} barStyle="light-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={st.hero}>
            <SafeAreaView edges={['top']} style={{ alignItems: 'center' }}>
              <Image source={require('../../assets/logo.png')} style={st.logo} resizeMode="contain" />
              <Text style={st.brand} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>BRILLIANT COACHING CENTRE</Text>
              <Text style={st.brandSub}>Student & Teacher Portal</Text>
            </SafeAreaView>
          </View>

          <Animated.View style={[st.card, { transform: [{ translateX: shake }] }]}>
            <View style={st.tabs}>
              {[['student', 'user-graduate', 'Student'], ['teacher', 'chalkboard-user', 'Teacher']].map(([k, ic, lb]) => (
                <Pressable key={k} onPress={() => setPortal(k)} style={[st.tab, portal === k && st.tabOn]}>
                  <Icon name={ic} size={14} color={portal === k ? C.primary : C.grey} />
                  <Text style={[st.tabText, portal === k && { color: C.primary }]}>{lb}</Text>
                </Pressable>
              ))}
            </View>

            <Field label="Enter ID" placeholder={portal === 'student' ? 'Enter your Student ID' : 'Enter your Teacher ID'} value={id} onChangeText={setId} autoComplete="username"
              returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} />
            <Field label="Enter password" placeholder="Enter your password" value={pw} onChangeText={setPw} secure
              autoComplete="current-password" returnKeyType="go" onSubmitEditing={submit} />
            <Btn label="Login" icon={portal === 'student' ? 'user-graduate' : 'chalkboard-user'} kind="primary" onPress={submit} full style={{ paddingVertical: 14, marginTop: 4 }} />
            <Text style={st.hint}>
              {portal === 'student' ? 'Student login: use the Student ID given by BCC.' : 'Teacher login: use the Teacher ID given by BCC.'}
            </Text>
          </Animated.View>
          <PoweredBy style={{ marginTop: 'auto' }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.primary, paddingBottom: 56, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, alignItems: 'center' },
  logo: { width: 116, height: 116, marginTop: 18 },
  brand: { fontFamily: F.s, fontSize: 14, letterSpacing: 1.3, color: C.accent, marginTop: 14, paddingHorizontal: 16 },
  brandSub: { fontFamily: F.m, fontSize: 13, color: C.accent, textAlign: 'center', marginTop: 8 },
  card: { backgroundColor: C.white, marginHorizontal: 18, marginTop: -34, borderRadius: R.lg, padding: 18, ...shadow },
  tabs: { flexDirection: 'row', backgroundColor: C.lav, borderRadius: 14, padding: 4, marginBottom: 18 },
  tab: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 11 },
  tabOn: { backgroundColor: C.accent },
  tabText: { fontFamily: F.s, fontSize: 13, color: C.grey },
  hint: { fontFamily: F.r, fontSize: 11.5, color: C.grey, textAlign: 'center', marginTop: 12 },
  foot: { fontFamily: F.r, fontSize: 11, color: C.grey, textAlign: 'center', marginVertical: 22 },
});
