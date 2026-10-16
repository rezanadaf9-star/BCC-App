import React, { useState } from 'react';
import { Alert, Share, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Async, Btn, Card, Empty, Field, Head, Icon, Page, Pill, Row, Sheet, Label } from '../../components/ui';
import { useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { useAsync } from '../../lib/helpers';
import { fnInvoke } from '../student/Quiz';
import { WEBSITE_URL } from '../../config';
import { C, F } from '../../theme';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
const genPassword = () => Array.from({ length: 12 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

/** Admin only: create teacher accounts, set class access, activate/deactivate, reset passwords. */
export function Teachers() {
  const { toast, loading } = useUi();
  const [creating, setCreating] = useState(false);
  const [reset, setReset] = useState(null);
  const [creds, setCreds] = useState(null); // {loginId,password,name}
  const q = useAsync(async () => {
    const { data, error } = await sb.from('profiles').select('id,full_name,login_id,is_active,created_at,teacher_class_assignments(class_no)').eq('role', 'teacher').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, []);

  const toggle = (t) => {
    const next = t.is_active === false;
    Alert.alert(next ? 'Activate teacher?' : 'Deactivate teacher?', `${t.full_name} (${t.login_id})${next ? '' : ' will no longer be able to log in.'}`, [{ text: 'Cancel', style: 'cancel' }, { text: next ? 'Activate' : 'Deactivate', style: next ? 'default' : 'destructive', onPress: async () => {
      loading(true, 'Updating...');
      try { await fnInvoke('admin-create-user', { action: 'set-status', user_id: t.id, is_active: next }); toast(`Teacher ${next ? 'activated' : 'deactivated'}.`, 'success'); q.reload(); }
      catch (e) { toast(e.message || 'Could not update status.', 'error'); } finally { loading(false); }
    } }]);
  };

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Teachers" sub="Create teacher accounts, share credentials and manage access." right={<Btn small icon="user-plus" label="Create" onPress={() => setCreating(true)} />} />
      <Async q={q}>
        {(rows) => rows.length ? rows.map((t) => {
          const cls = (t.teacher_class_assignments || []).map((a) => `Class ${a.class_no}`).join(', ') || 'Not assigned';
          return (
            <Card key={t.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={st.ic}><Icon name="chalkboard-user" size={15} color={C.accent} /></View>
                <View style={{ flex: 1 }}><Text style={st.t}>{t.full_name}</Text><Label>{t.login_id} • {cls}</Label></View>
                {t.is_active === false ? <Pill danger text="Inactive" /> : <Pill active text="Active" />}
              </View>
              <Row style={{ marginTop: 12 }}>
                <Btn small kind={t.is_active === false ? 'yellow' : 'ghost'} icon={t.is_active === false ? 'user-check' : 'user-slash'} label={t.is_active === false ? 'Activate' : 'Deactivate'} onPress={() => toggle(t)} />
                <Btn small kind="soft" icon="key" label="Reset password" onPress={() => setReset(t)} />
              </Row>
            </Card>
          );
        }) : <Empty icon="chalkboard-user" title="No teacher accounts yet" text="Tap Create to add the first teacher." />}
      </Async>

      <CreateTeacher visible={creating} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); setCreds(c); q.reload(); }} />
      <ResetPassword teacher={reset} onClose={() => setReset(null)} onDone={(c) => { setReset(null); setCreds(c); }} />
      <Credentials creds={creds} onClose={() => setCreds(null)} />
    </Page>
  );
}

function CreateTeacher({ visible, onClose, onCreated }) {
  const { toast, loading } = useUi();
  const [name, setName] = useState('');
  const [c10, setC10] = useState(true);
  const [c12, setC12] = useState(true);
  const [pw, setPw] = useState('');
  const save = async () => {
    const full_name = name.trim();
    const class_nos = [c10 && 10, c12 && 12].filter(Boolean);
    if (full_name.split(/\s+/).filter(Boolean).length < 2) return toast('Enter the full name with at least two parts (used for the Teacher ID initials).', 'error');
    if (!class_nos.length) return toast('Select at least one class.', 'error');
    const password = pw || genPassword();
    if (password.length < 8) return toast('Password must contain at least 8 characters.', 'error');
    loading(true, 'Creating teacher account...');
    try {
      const d = await fnInvoke('admin-create-user', { type: 'teacher', full_name, password, class_nos });
      setName(''); setPw(''); setC10(true); setC12(true);
      onCreated({ loginId: d.login_id, password, name: full_name });
    } catch (e) { toast(e.message || 'Could not create teacher.', 'error'); } finally { loading(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Create teacher" footer={<><Btn small kind="ghost" label="Cancel" onPress={onClose} /><Btn small icon="check" label="Create teacher" onPress={save} /></>}>
      <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Jackie Kumar" autoCapitalize="words" />
      <Text style={st.lbl}>Class access</Text>
      <View style={st.sw}><Text style={st.swT}>Class 10</Text><Switch value={c10} onValueChange={setC10} trackColor={{ true: C.primary, false: C.line }} thumbColor={c10 ? C.accent : C.white} /></View>
      <View style={st.sw}><Text style={st.swT}>Class 12</Text><Switch value={c12} onValueChange={setC12} trackColor={{ true: C.primary, false: C.line }} thumbColor={c12 ? C.accent : C.white} /></View>
      <Field label="Initial password" value={pw} onChangeText={setPw} placeholder="Leave blank to generate automatically" style={{ marginTop: 12 }} />
      <Label>Teacher IDs look like BCC01ZQ: BCC + serial number + initials of the first two names. Passwords can only be changed by the administrator.</Label>
    </Sheet>
  );
}

function ResetPassword({ teacher, onClose, onDone }) {
  const { toast, loading } = useUi();
  const [pw, setPw] = useState('');
  const go = async () => {
    if (pw.length < 8) return toast('Use at least 8 characters.', 'error');
    loading(true, 'Resetting password...');
    try {
      await fnInvoke('admin-create-user', { action: 'reset-password', user_id: teacher.id, password: pw });
      const c = { loginId: teacher.login_id, password: pw, name: teacher.full_name };
      setPw(''); onDone(c);
    } catch (e) { toast(e.message || 'Password reset failed.', 'error'); } finally { loading(false); }
  };
  return (
    <Sheet visible={!!teacher} onClose={onClose} title="Reset teacher password" footer={<><Btn small kind="ghost" label="Cancel" onPress={onClose} /><Btn small icon="key" label="Reset password" onPress={go} /></>}>
      <Label style={{ marginBottom: 12 }}>Set a new password for {teacher?.full_name} ({teacher?.login_id}). Teachers cannot change their own password.</Label>
      <Field label="New password" value={pw} onChangeText={setPw} placeholder="At least 8 characters" />
      <Btn small kind="soft" icon="wand-magic-sparkles" label="Generate" onPress={() => setPw(genPassword())} style={{ alignSelf: 'flex-start' }} />
    </Sheet>
  );
}

function Credentials({ creds, onClose }) {
  const { toast } = useUi();
  if (!creds) return null;
  const message = `Assalamu Alaikum ${creds.name},\n\nYour BCC Teacher Portal account is ready.\nWebsite: ${WEBSITE_URL}\nTeacher ID: ${creds.loginId}\nPassword: ${creds.password}\n\nPlease keep these credentials private.`;
  return (
    <Sheet visible={!!creds} onClose={onClose} title="Credentials ready">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Icon name="circle-check" size={26} color={C.success} />
        <View style={{ flex: 1 }}><Text style={st.t}>{creds.name}</Text><Label>Send these privately. The password cannot be viewed again later.</Label></View>
      </View>
      {[['Teacher ID', creds.loginId], ['Password', creds.password]].map(([k, v]) => (
        <View key={k} style={st.cred}><Label>{k}</Label><Text selectable style={st.credV}>{v}</Text></View>
      ))}
      <Row style={{ marginTop: 14 }}>
        <Btn small kind="ghost" icon="copy" label="Copy" onPress={async () => { await Clipboard.setStringAsync(message); toast('Credentials copied.', 'success'); }} />
        <Btn small icon="share-nodes" label="Share (WhatsApp…)" onPress={() => Share.share({ message })} />
        <Btn small kind="yellow" label="Done" onPress={onClose} />
      </Row>
    </Sheet>
  );
}

const st = StyleSheet.create({
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  t: { fontFamily: F.b, fontSize: 14.5, color: C.primary },
  lbl: { fontFamily: F.m, fontSize: 12.5, color: C.primary, marginBottom: 6 },
  sw: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bg, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 8 },
  swT: { fontFamily: F.s, fontSize: 13.5, color: C.primary },
  cred: { backgroundColor: C.bg, borderRadius: 12, padding: 12, marginBottom: 8 },
  credV: { fontFamily: F.s, fontSize: 14, color: C.primary, marginTop: 2 },
});
