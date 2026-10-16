import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Async, Avatar, Btn, Card, Empty, Field, Head, Icon, ListItem, Page, Pill, Row, Select, Sheet, Label, Stat, SectionTitle } from '../../components/ui';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { fmtDate, studentPhotoUrl, addPhotoUrls, uploadLocalFile, useAsync } from '../../lib/helpers';
import { fnInvoke } from '../student/Quiz';
import { WEBSITE_URL } from '../../config';
import { C, F, R } from '../../theme';

/* ----------------------------- students ----------------------------- */
export function Students() {
  const { toast } = useUi();
  const { isAdmin, classes } = useApp();
  const [creating, setCreating] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [filter, setFilter] = useState('all');
  const q = useAsync(async () => {
    const { data, error } = await sb.from('student_profiles').select('*,profiles(full_name,login_id)').order('class_no').order('roll_number');
    if (error) throw error;
    return data || [];
  }, []);
  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Students" sub={isAdmin ? 'Create accounts and view student information.' : 'Review students in your assigned classes.'} right={isAdmin ? <Btn small icon="user-plus" label="Create" onPress={() => setCreating(true)} /> : null} />
      <Row style={{ marginBottom: 12 }}>
        {[['all', 'All'], ...classes.map((c) => [String(c), `Class ${c}`])].map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[st.chip, filter === k && { backgroundColor: C.primary }]}>
            <Text style={[st.chipT, filter === k && { color: C.accent }]}>{l}</Text>
          </Pressable>
        ))}
      </Row>
      <Async q={q}>
        {(rows) => {
          const list = rows.filter((x) => filter === 'all' || String(x.class_no) === filter);
          return list.length ? list.map((x) => (
            <ListItem key={x.id} title={x.profiles?.full_name || 'Student'} sub={`${x.profiles?.login_id || ''} • Class ${x.class_no} • Roll ${x.roll_number || '—'} • Batch ${x.batch}`}
              left={<Avatar name={x.profiles?.full_name} size={42} />} right={<Icon name="chevron-right" size={12} color={C.grey} />} onPress={() => setViewId(x.id)} />
          )) : <Empty icon="users" title="No students yet" />;
        }}
      </Async>
      {isAdmin && <CreateStudent visible={creating} onClose={() => setCreating(false)} onCreated={() => { q.reload(); }} />}
      <ViewStudent id={viewId} onClose={() => setViewId(null)} onChanged={q.reload} />
    </Page>
  );
}

function CreateStudent({ visible, onClose, onCreated }) {
  const { toast, loading } = useUi();
  const [f, setF] = useState({ name: '', cls: '10', roll: '', batch: '26', phone: '', pw: '' });
  const [photo, setPhoto] = useState(null);
  const [done, setDone] = useState(null);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast('Photo permission is required.', 'error');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled) setPhoto(r.assets[0]);
  };
  const gen = () => set('pw')(Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6) + Math.floor(10 + Math.random() * 89));

  const save = async () => {
    if (!f.name.trim() || f.pw.length < 8) return toast('Name and an 8+ character password are required.', 'error');
    loading(true, 'Creating student...');
    try {
      const d = await fnInvoke('admin-create-user', { type: 'student', full_name: f.name.trim(), class_no: Number(f.cls), roll_number: f.roll.trim(), batch: f.batch, password: f.pw, phone: f.phone.trim() || null });
      if (photo && d.user_id) {
        const path = `${d.user_id}/profile.jpg`;
        await uploadLocalFile('student-photos', path, photo.uri, 'image/jpeg', true);
        const u = await sb.from('student_profiles').update({ photo_path: path }).eq('user_id', d.user_id);
        if (u.error) throw u.error;
      }
      setDone({ loginId: d.login_id, password: f.pw, name: f.name.trim() });
      setF({ name: '', cls: '10', roll: '', batch: '26', phone: '', pw: '' }); setPhoto(null);
      onCreated();
    } catch (e) { toast(e.message || 'Could not create student.', 'error'); } finally { loading(false); }
  };

  const message = done ? `Website: ${WEBSITE_URL}\nUser ID: ${done.loginId}\nPassword: ${done.password}` : '';
  if (done)
    return (
      <Sheet visible={visible} onClose={() => { setDone(null); onClose(); }} title="Student created">
        <View style={st.okRow}><Icon name="circle-check" size={26} color={C.success} /><View style={{ flex: 1 }}><Text style={st.okName}>{done.name}</Text><Label>Login details are ready to send to the student.</Label></View></View>
        {[['User ID', done.loginId], ['Password', done.password], ['Website', WEBSITE_URL]].map(([k, v]) => (
          <View key={k} style={st.cred}><Label>{k}</Label><Text selectable style={st.credV}>{v}</Text></View>
        ))}
        <Row style={{ marginTop: 14 }}>
          <Btn kind="ghost" small icon="copy" label="Copy" onPress={async () => { await Clipboard.setStringAsync(message); toast('Login details copied.', 'success'); }} />
          <Btn small icon="share-nodes" label="Share (WhatsApp…)" onPress={() => Share.share({ message })} />
          <Btn small kind="yellow" label="Done" onPress={() => { setDone(null); onClose(); }} />
        </Row>
      </Sheet>
    );

  return (
    <Sheet visible={visible} onClose={onClose} title="Create student" footer={<><Btn small kind="ghost" label="Cancel" onPress={onClose} /><Btn small icon="check" label="Create" onPress={save} /></>}>
      <Field label="Full name" value={f.name} onChangeText={set('name')} autoCapitalize="words" />
      <Row style={{ gap: 12 }}>
        <Select style={{ flex: 1 }} label="Class" value={f.cls} onChange={set('cls')} options={[{ label: 'Class 10', value: '10' }, { label: 'Class 12', value: '12' }]} />
        <Select style={{ flex: 1 }} label="Batch" value={f.batch} onChange={set('batch')} options={[{ label: '26', value: '26' }, { label: '27', value: '27' }]} />
      </Row>
      <Field label="Roll number" value={f.roll} onChangeText={set('roll')} keyboardType="numeric" />
      <Field label="Phone number (optional)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label="Initial password" value={f.pw} onChangeText={set('pw')} secure hint="Minimum 8 characters." />
      <Row style={{ marginBottom: 12 }}>
        <Btn small kind="soft" icon="wand-magic-sparkles" label="Generate password" onPress={gen} />
        <Btn small kind="ghost" icon="camera" label={photo ? 'Photo selected ✓' : 'Add photo (optional)'} onPress={pick} />
      </Row>
      <Label>ID format: batch + BCC + class + first two letters of name + random 3 digits. Passwords are handled by Supabase Auth.</Label>
    </Sheet>
  );
}

function ViewStudent({ id, onClose, onChanged }) {
  const { toast, loading } = useUi();
  const q = useAsync(async () => {
    if (!id) return null;
    const { data, error } = await sb.from('student_profiles').select('*,profiles(full_name,login_id)').eq('id', id).single();
    if (error) throw error;
    const at = await sb.from('quiz_attempts').select('*,quizzes(title)').eq('student_id', data.user_id).order('submitted_at', { ascending: false }).limit(20);
    return { s: data, photo: await studentPhotoUrl(data.photo_path), attempts: at.data || [] };
  }, [id]);

  const upload = async () => {
    const s = q.data.s;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast('Photo permission is required.', 'error');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    loading(true, 'Updating profile photo...');
    try {
      const path = `${s.user_id}/profile.jpg`;
      await uploadLocalFile('student-photos', path, r.assets[0].uri, 'image/jpeg', true);
      const u = await sb.from('student_profiles').update({ photo_path: path }).eq('user_id', s.user_id).select('photo_path').single();
      if (u.error) throw new Error(u.error.message || 'Could not update the profile. Run PHOTO_PROFILE_MIGRATION.sql in Supabase.');
      toast('Profile photo updated.', 'success'); q.reload(); onChanged();
    } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
  };
  const remove = () => {
    const s = q.data.s;
    Alert.alert('Delete photo?', `Delete profile photo for ${s.profiles?.full_name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
      loading(true, 'Deleting photo...');
      try {
        const d = await sb.storage.from('student-photos').remove([s.photo_path || `${s.user_id}/profile.jpg`]);
        if (d.error) throw d.error;
        const u = await sb.from('student_profiles').update({ photo_path: null }).eq('user_id', s.user_id);
        if (u.error) throw u.error;
        toast('Photo deleted.', 'success'); q.reload(); onChanged();
      } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
    } }]);
  };

  return (
    <Sheet visible={!!id} onClose={onClose} title={q.data?.s?.profiles?.full_name || 'Student'}>
      <Async q={q}>
        {(d) => d && (
          <>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <Avatar uri={d.photo} name={d.s.profiles?.full_name} size={92} ring />
              <Text style={st.okName}>{d.s.profiles?.full_name}</Text>
              <Label>{d.s.phone || 'No phone number'}</Label>
              <Row style={{ marginTop: 10, justifyContent: 'center' }}>
                <Btn small icon="camera" label={d.s.photo_path ? 'Replace photo' : 'Add photo'} onPress={upload} />
                {!!d.s.photo_path && <Btn small kind="ghost" icon="trash" label="Delete" onPress={remove} />}
              </Row>
            </View>
            <View style={st.grid}><Stat icon="id-card" label="Student ID" value={d.s.profiles?.login_id || '—'} style={{ flex: 2 }} /><Stat icon="graduation-cap" label="Class" value={String(d.s.class_no)} /></View>
            <Label style={{ marginBottom: 6 }}>Roll {d.s.roll_number || '—'} • Batch {d.s.batch}</Label>
            <SectionTitle>Quiz history</SectionTitle>
            {d.attempts.length ? d.attempts.map((a) => (
              <View key={a.id} style={st.hRow}>
                <View style={{ flex: 1 }}><Text style={st.hT}>{a.quizzes?.title}</Text><Label>{fmtDate(a.submitted_at)} • {a.correct_count} correct • {a.wrong_count} wrong</Label></View>
                <Text style={st.hS}>{a.score}/{a.total_marks}</Text>
              </View>
            )) : <Label>No attempts yet.</Label>}
          </>
        )}
      </Async>
    </Sheet>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.primary, borderRadius: R.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heroT: { fontFamily: F.b, fontSize: 19, color: C.white },
  heroS: { fontFamily: F.r, fontSize: 12, color: C.soft, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  chip: { backgroundColor: C.white, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line },
  chipT: { fontFamily: F.s, fontSize: 12, color: C.primary },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  okName: { fontFamily: F.b, fontSize: 17, color: C.primary, marginTop: 6 },
  cred: { backgroundColor: C.soft, borderRadius: 12, padding: 12, marginBottom: 8 },
  credV: { fontFamily: F.s, fontSize: 14, color: C.primary, marginTop: 2 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  hT: { fontFamily: F.s, fontSize: 13, color: C.primary },
  hS: { fontFamily: F.b, fontSize: 14, color: C.primary },
});
