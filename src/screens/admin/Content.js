import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Btn, Card, Empty, Field, Head, Icon, ListItem, Page, Pill, Row, Select, SectionTitle, Label } from '../../components/ui';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { fmtDate, slug, subjectsForClass, uploadLocalFile, useAsync } from '../../lib/helpers';
import { notify } from '../../lib/notifications';
import { C, F } from '../../theme';


export function Content() {
  const { profile, classes } = useApp();
  const { toast, loading } = useUi();
  const CLASSES = classes.map((c) => ({ label: `Class ${c}`, value: String(c) }));
  const subs = useAsync(async () => Object.fromEntries(await Promise.all(classes.map(async (c) => [c, await subjectsForClass(c)]))), [classes.join(',')]);
  const recent = useAsync(async () => {
    const sel = 'id,title,created_at,class_no,file_path,subjects(name)';
    const [l, n, h] = await Promise.all([
      sb.from('lectures').select(sel).order('created_at', { ascending: false }).limit(5),
      sb.from('notes').select(sel).order('created_at', { ascending: false }).limit(5),
      sb.from('homework').select(sel).order('created_at', { ascending: false }).limit(5),
    ]);
    return [...(l.data || []).map((x) => ({ ...x, type: 'lecture' })), ...(n.data || []).map((x) => ({ ...x, type: 'note' })), ...(h.data || []).map((x) => ({ ...x, type: 'homework' }))]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  }, []);

  const [cls, setCls] = useState(String(classes[0] || 10));
  const [type, setType] = useState('note');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [noteType, setNoteType] = useState('pdf');
  const [due, setDue] = useState('');
  const [instr, setInstr] = useState('');
  const [source, setSource] = useState('youtube');
  const [live, setLive] = useState('false');
  const [yt, setYt] = useState('');
  const [desc, setDesc] = useState('');

  const subjectOptions = (subs.data?.[cls] || []).map((s) => ({ label: s.name, value: s.id }));
  useEffect(() => { setSubject(subjectOptions[0]?.value || ''); }, [cls, subs.data]);
  useEffect(() => { setFile(null); }, [type, source]);

  const pickFile = async () => {
    const isVideo = type === 'lecture';
    const r = await DocumentPicker.getDocumentAsync({ type: isVideo ? ['video/*'] : ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    setFile(a);
    if (!isVideo && type === 'note') setNoteType(a.mimeType?.includes('pdf') ? 'pdf' : a.mimeType?.includes('png') ? 'png' : 'jpg');
  };

  const save = async () => {
    if (!subject || !title.trim()) return toast('Class, subject and title are required.', 'error');
    loading(true, 'Saving content...');
    try {
      const classNo = Number(cls);
      if (type === 'lecture') {
        let filePath = null;
        if (source === 'upload') {
          if (!file) throw new Error('Choose a video file.');
          filePath = await uploadLocalFile('bcc-content', `lectures/${classNo}/${Date.now()}-${slug(file.name)}`, file.uri, file.mimeType || 'video/mp4');
        } else if (!yt.trim()) throw new Error('Enter the YouTube URL.');
        const { data: ins, error } = await sb.from('lectures').insert({ class_no: classNo, subject_id: subject, title: title.trim(), youtube_url: source === 'youtube' ? yt.trim() || null : null, file_path: filePath, is_live: live === 'true', downloadable: !!filePath, description: desc.trim() || null, created_by: profile.id }).select('id').single();
        if (error) throw error;
        await notify({ classNo, kind: 'lecture', title: `${live === 'true' ? 'Live lecture' : 'New lecture'}: ${title.trim()}`, body: subjectOptions.find((o) => o.value === subject)?.label, refId: ins?.id, refSubjectId: subject });
      } else {
        if (!file) throw new Error('Choose a file.');
        const fp = await uploadLocalFile('bcc-content', `${type}s/${classNo}/${Date.now()}-${slug(file.name)}`, file.uri, file.mimeType || 'application/octet-stream');
        if (type === 'note') {
          const { data: ins, error } = await sb.from('notes').insert({ class_no: classNo, subject_id: subject, title: title.trim(), file_path: fp, file_type: noteType, created_by: profile.id }).select('id').single();
          if (error) throw error;
          await notify({ classNo, kind: 'note', title: `New note: ${title.trim()}`, body: subjectOptions.find((o) => o.value === subject)?.label, refId: ins?.id, refSubjectId: subject });
        } else {
          const { data: ins, error } = await sb.from('homework').insert({ class_no: classNo, subject_id: subject, title: title.trim(), file_path: fp, instructions: instr.trim() || null, due_date: due.trim() || null, created_by: profile.id }).select('id').single();
          if (error) throw error;
          await notify({ classNo, kind: 'homework', title: `New homework: ${title.trim()}`, body: subjectOptions.find((o) => o.value === subject)?.label, refId: ins?.id, refSubjectId: subject });
        }
      }
      toast('Content saved.', 'success');
      setTitle(''); setFile(null); setYt(''); setDesc(''); setInstr(''); setDue('');
      recent.reload();
    } catch (e) { toast(e.message || 'Could not save content.', 'error'); } finally { loading(false); }
  };

  const del = (x) =>
    Alert.alert('Delete content?', 'This will delete the content permanently.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
      loading(true, 'Deleting content...');
      try {
        const table = x.type === 'lecture' ? 'lectures' : x.type === 'note' ? 'notes' : 'homework';
        const { error } = await sb.from(table).delete().eq('id', x.id);
        if (error) throw error;
        if (x.file_path) await sb.storage.from('bcc-content').remove([x.file_path]).catch(() => {});
        toast('Content deleted.', 'success'); recent.reload();
      } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
    } }]);

  return (
    <Page onRefresh={() => { recent.reload(); }}>
      <Head title="Content" sub="Choose a class first. Content is only visible to that class." />
      <Card>
        <SectionTitle>Upload / add content</SectionTitle>
        <Row style={{ gap: 12 }}>
          <Select style={{ flex: 1 }} label="Class" value={cls} onChange={setCls} options={CLASSES} />
          <Select style={{ flex: 1 }} label="Type" value={type} onChange={setType} options={[{ label: 'Note', value: 'note' }, { label: 'Homework', value: 'homework' }, { label: 'Lecture', value: 'lecture' }]} />
        </Row>
        <Select label="Subject" value={subject} onChange={setSubject} options={subjectOptions} />
        <Field label="Title" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
        {type === 'lecture' ? (
          <>
            <Row style={{ gap: 12 }}>
              <Select style={{ flex: 1 }} label="Source" value={source} onChange={setSource} options={[{ label: 'YouTube URL', value: 'youtube' }, { label: 'Upload video', value: 'upload' }]} />
              <Select style={{ flex: 1 }} label="Live lecture?" value={live} onChange={setLive} options={[{ label: 'No', value: 'false' }, { label: 'Yes', value: 'true' }]} />
            </Row>
            {source === 'youtube' ? <Field label="YouTube URL" value={yt} onChangeText={setYt} placeholder="https://www.youtube.com/watch?v=..." keyboardType="url" />
              : <FilePick file={file} onPick={pickFile} label="Choose video" />}
            <Field label="Description" value={desc} onChangeText={setDesc} multiline autoCapitalize="sentences" />
          </>
        ) : (
          <>
            <FilePick file={file} onPick={pickFile} label="Choose PDF / JPG / PNG" />
            {type === 'note' ? <Select label="File type" value={noteType} onChange={setNoteType} options={[{ label: 'PDF', value: 'pdf' }, { label: 'JPG', value: 'jpg' }, { label: 'PNG', value: 'png' }]} />
              : (<><Field label="Due date (YYYY-MM-DD, optional)" value={due} onChangeText={setDue} placeholder="2026-11-30" /><Field label="Instructions" value={instr} onChangeText={setInstr} multiline autoCapitalize="sentences" /></>)}
          </>
        )}
        <Btn icon="floppy-disk" label="Save content" onPress={save} full />
      </Card>

      <Card>
        <SectionTitle>Recent content</SectionTitle>
        {(recent.data || []).length ? recent.data.map((x) => (
          <View key={`${x.type}${x.id}`} style={st.row}>
            <View style={{ flex: 1 }}><Text style={st.rt}>{x.title}</Text><Label>{x.type} • Class {x.class_no} • {x.subjects?.name || ''}</Label></View>
            <Btn small kind="danger" icon="trash" label="" onPress={() => del(x)} style={{ paddingHorizontal: 12 }} />
          </View>
        )) : <Label>No content yet.</Label>}
      </Card>

      <NotebookAdmin subs={subs.data} />
    </Page>
  );
}

function FilePick({ file, onPick, label }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Btn kind="soft" icon={file ? 'file-circle-check' : 'paperclip'} label={file ? file.name : label} onPress={onPick} full />
      {file?.size ? <Label style={{ marginTop: 4 }}>{(file.size / 1048576).toFixed(1)} MB</Label> : null}
    </View>
  );
}

function NotebookAdmin({ subs }) {
  const { profile, classes } = useApp();
  const { toast, loading } = useUi();
  const CLASSES = classes.map((c) => ({ label: `Class ${c}`, value: String(c) }));
  const [cls, setCls] = useState(String(classes[0] || 10));
  const [subject, setSubject] = useState('');
  const [rtype, setRtype] = useState('notes');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const opts = (subs?.[cls] || []).map((s) => ({ label: s.name, value: s.id }));
  useEffect(() => { setSubject(opts[0]?.value || ''); }, [cls, subs]);
  const list = useAsync(async () => {
    const { data, error } = await sb.from('notebooklm_resources').select('id,title,class_no,resource_type,url,is_active,created_at,subjects(name)').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return data || [];
  }, []);

  const publish = async () => {
    if (!title.trim() || !url.trim()) return toast('Title and resource URL are required.', 'error');
    if (!/^https?:\/\//i.test(url.trim())) return toast('Enter a valid http/https resource URL.', 'error');
    loading(true, 'Publishing AI resource...');
    try {
      const { data: ins, error } = await sb.from('notebooklm_resources').insert({ class_no: Number(cls), subject_id: subject || null, resource_type: rtype, title: title.trim(), url: url.trim(), description: desc.trim() || null, is_active: true, created_by: profile.id }).select('id').single();
      if (error) throw error;
      await notify({ classNo: Number(cls), kind: 'ai', title: `New AI study resource: ${title.trim()}`, body: desc.trim() || undefined, refId: ins?.id });
      setTitle(''); setUrl(''); setDesc(''); toast('AI resource published.', 'success'); list.reload();
    } catch (e) { toast(e.message || 'Could not publish.', 'error'); } finally { loading(false); }
  };
  const remove = (id) => Alert.alert('Remove resource?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => {
    const { error } = await sb.from('notebooklm_resources').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    toast('AI resource removed.', 'success'); list.reload();
  } }]);

  return (
    <Card>
      <SectionTitle>AI Study Hub / NotebookLM</SectionTitle>
      <Label style={{ marginBottom: 12 }}>Publish a NotebookLM or Gemini resource link for a class.</Label>
      <Row style={{ gap: 12 }}>
        <Select style={{ flex: 1 }} label="Class" value={cls} onChange={setCls} options={CLASSES} />
        <Select style={{ flex: 1 }} label="Type" value={rtype} onChange={setRtype} options={[{ label: 'Notes & summaries', value: 'notes' }, { label: 'Lecture', value: 'lecture' }, { label: 'Doubt solving', value: 'doubt' }, { label: 'AI study assistant', value: 'ai' }]} />
      </Row>
      <Select label="Subject" value={subject} onChange={setSubject} options={opts} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. History Chapter 1 AI Notes" autoCapitalize="sentences" />
      <Field label="NotebookLM / Gemini URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://notebooklm.google.com/..." />
      <Field label="Description" value={desc} onChangeText={setDesc} multiline autoCapitalize="sentences" />
      <Btn icon="paper-plane" label="Publish AI resource" onPress={publish} full />
      <View style={{ marginTop: 14 }}>
        {(list.data || []).map((r) => (
          <View key={r.id} style={st.row}>
            <View style={{ flex: 1 }}><Text style={st.rt}>{r.title}</Text><Label>Class {r.class_no} • {r.subjects?.name || 'General'} • {r.resource_type} • {fmtDate(r.created_at)}</Label></View>
            <Btn small kind="danger" label="Remove" onPress={() => remove(r.id)} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  rt: { fontFamily: F.s, fontSize: 13, color: C.primary },
});
