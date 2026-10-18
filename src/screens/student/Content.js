// Lectures / Notes / Homework (+ NotebookLM) for students
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Async, Avatar, Btn, Card, Empty, Head, Icon, ListItem, Loading, Page, Pill, Row, Sheet, Label } from '../../components/ui';
import DiscussionView from '../../components/Discussion';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { downloadAndShare, fmtDate, fmtDateTime, isMissingTable, isToday, signedUrl, timeAgo, todayLabel, useAsync, useDayKey, useRealtimeTables, youtubeId } from '../../lib/helpers';
import { C, F, R } from '../../theme';


function groupBySubject(rows) {
  return [...new Map(rows.map((x) => [x.subject_id, x.subjects?.name || 'Other'])).entries()];
}
function SubjectGrid({ rows, onOpen, unit, blurb }) {
  const subjects = groupBySubject(rows);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {subjects.map(([id, name]) => (
        <Card key={id} style={{ width: '48%', marginBottom: 0 }} onPress={() => onOpen(id)}>
          <View style={st.subIcon}><Icon name="book" size={14} color={C.accent} /></View>
          <Text style={st.subName} numberOfLines={2}>{name}</Text>
          <Text style={st.subBlurb}>{blurb}</Text>
          <Text style={st.subCount}>{rows.filter((x) => x.subject_id === id).length} {unit}</Text>
        </Card>
      ))}
    </View>
  );
}

function SectionHead({ title, icon, count, live }) {
  return (
    <View style={st.secRow}>
      <View style={[st.secIcon, live && { backgroundColor: C.alert }]}><Icon name={icon} size={12} color={live ? C.white : C.accent} /></View>
      <Text style={st.secTitle}>{title}</Text>
      {count != null && count > 0 && <Pill text={String(count)} active={!live} danger={live} />}
      <View style={{ flex: 1 }} />
      {!live && <Text style={st.secDate}>{todayLabel()}</Text>}
    </View>
  );
}
function TodayEmpty({ icon, text, sub }) {
  return (
    <View style={st.todayEmpty}>
      <View style={st.todayEmptyIc}><Icon name={icon} size={18} /></View>
      <Text style={st.todayEmptyT}>{text}</Text>
      {!!sub && <Text style={st.todayEmptyS}>{sub}</Text>}
    </View>
  );
}

/* ----------------------------- Lectures ----------------------------- */
export function Lectures({ nav }) {
  const { classNo } = useApp();
  useDayKey(); // refresh "today" at school midnight / on resume
  const q = useAsync(async () => {
    const { data, error } = await sb.from('lectures').select('*,subjects(name)').eq('class_no', classNo)
      .order('is_live', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [classNo]);
  useRealtimeTables(['lectures'], classNo, q.reload);
  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Async q={q}>
        {(rows) => {
          const live = rows.filter((x) => x.is_live);
          const today = rows.filter((x) => !x.is_live && isToday(x.created_at));
          return (
            <>
              {live.length > 0 && (
                <>
                  <SectionHead title="Live Now" icon="tower-broadcast" count={live.length} live />
                  {live.map((x) => <LectureRow key={`l${x.id}`} x={x} nav={nav} />)}
                </>
              )}
              <SectionHead title="Today's Lectures" icon="video" count={today.length} />
              {today.length ? today.map((x) => <LectureRow key={x.id} x={x} nav={nav} />) : <TodayEmpty icon="video" text="No lectures today" sub="New lectures appear here automatically." />}
              {rows.length === 0 ? <Empty icon="video" title="No lectures yet" text="Your class lectures will appear here." /> : (
                <>
                  <Text style={st.chooseText}>Choose a subject to view live and recorded lectures.</Text>
                  <SubjectGrid rows={rows} unit="lecture(s)" blurb="Live & recorded" onOpen={(id) => nav.push('lectures-subject', { subjectId: id })} />
                </>
              )}
            </>
          );
        }}
      </Async>
    </Page>
  );
}
function LectureRow({ x, nav }) {
  const kind = x.youtube_url ? 'YouTube' : x.file_path ? 'Uploaded video' : 'Lecture';
  return (
    <ListItem
      title={x.title}
      sub={`${x.subjects?.name || 'Subject'} • ${kind} • ${fmtDate(x.created_at)}`}
      left={<View style={[st.play, x.is_live && { backgroundColor: C.alert }]}><Icon name={x.is_live ? 'tower-broadcast' : 'play'} size={14} color={C.white} /></View>}
      right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{x.is_live && <Pill text="LIVE" active />}<Icon name="chevron-right" size={12} color={C.grey} /></View>}
      onPress={() => nav.push('lecture-player', { lectureId: x.id })}
    />
  );
}
export function LecturesSubject({ params, nav }) {
  const { classNo } = useApp();
  const q = useAsync(async () => {
    const { data, error } = await sb.from('lectures').select('*,subjects(name)').eq('class_no', classNo).eq('subject_id', params.subjectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [params.subjectId]);
  useRealtimeTables(['lectures'], classNo, q.reload);
  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {(rows) => (
          <>
            <Head title={rows[0]?.subjects?.name || 'Subject'} sub="Lectures stay inside the BCC app." />
            {rows.length ? rows.map((x) => <LectureRow key={x.id} x={x} nav={nav} />) : <Empty icon="video" title="No lectures yet" />}
          </>
        )}
      </Async>
    </Page>
  );
}

function FileVideo({ url }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />;
}

export function LecturePlayer({ params, nav }) {
  const { toast } = useUi();
  const { width, height } = useWindowDimensions();
  const [fs, setFs] = useState(false);
  const full = fs || width > height; // rotating the phone to landscape = full screen
  const q = useAsync(async () => {
    const { data, error } = await sb.from('lectures').select('*,subjects(name)').eq('id', params.lectureId).single();
    if (error) throw error;
    const file = data.file_path ? await signedUrl(data.file_path, 3600) : null;
    return { x: data, file };
  }, [params.lectureId]);

  // allow rotation only on this screen; lock back to portrait when leaving
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);
  useEffect(() => { nav.setImmersive(full); return () => nav.setImmersive(false); }, [full]);

  const enterFs = async () => {
    setFs(true);
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch (_) {}
  };
  const exitFs = useCallback(async () => {
    setFs(false);
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (_) {}
    setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 700); // re-enable auto-rotate
  }, []);
  useEffect(() => {
    nav.setGuard(() => { if (full) { exitFs(); return true; } return false; });
    return () => nav.setGuard(null);
  }, [full, exitFs]);

  const x = q.data?.x;
  const yt = youtubeId(x?.youtube_url || '');
  const playerH = (width - 32) * 0.5625;

  const media = !q.data ? (q.error ? <Empty icon="triangle-exclamation" title="Could not load lecture" text={q.error.message} /> : <Loading />)
    : x.youtube_url ? (
      yt ? (
        <>
        <WebView
          allowsFullscreenVideo={false}
          setSupportMultipleWindows={false}
          // Never leave the app: block every top-level navigation (YouTube logo, title, channel, share, "watch on YouTube"...)
          onShouldStartLoadWithRequest={(req) => {
            const u = req?.url || '';
            if (u.startsWith('about:') || u.startsWith('data:') || u.startsWith('https://rezanadaf9-star.github.io')) return true;
            if (req?.isTopFrame === false) return /^https?:/i.test(u); // frames inside the player keep working
            return false;
          }}
          onOpenWindow={() => {}}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
          style={{ flex: 1, backgroundColor: '#000' }}
          // https base URL avoids YouTube's "error 153" inside WebViews. fs=0 hides YouTube's own full-screen button (ours handles landscape).
          source={{
            baseUrl: 'https://rezanadaf9-star.github.io/',
            html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000"><iframe width="100%" height="100%" style="border:0;position:absolute;inset:0" src="https://www.youtube.com/embed/${encodeURIComponent(yt)}?rel=0&playsinline=1&fs=0&modestbranding=1&iv_load_policy=3&disablekb=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe></body></html>`,
 }}
        />
        <View pointerEvents="auto" style={[st.shield, { top: 0, left: 0, right: 120, height: 58 }]} />
        <View pointerEvents="auto" style={[st.shield, { bottom: 0, right: 0, width: 112, height: 40 }]} />
        <View pointerEvents="auto" style={[st.shield, { bottom: 0, left: 0, width: 64, height: 48 }]} />
        </>
      ) : <Empty icon="link-slash" title="Invalid YouTube URL" text="The teacher configured an invalid link." />
    ) : q.data.file ? <FileVideo url={q.data.file} />
      : <Empty icon="video-slash" title="No lecture media" text="No lecture media has been attached yet." />;

  return (
    <View style={{ flex: 1, backgroundColor: full ? '#000' : C.bg }}>
      <View style={full ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={full ? { flex: 1, backgroundColor: '#000' } : { height: playerH, borderRadius: R.md, overflow: 'hidden', backgroundColor: '#000' }}>
          {media}
          {!!q.data && (q.data.file || yt) && (
            <Pressable onPress={full ? exitFs : enterFs} hitSlop={8} style={[st.fsBtn, q.data.file ? { top: 10 } : { bottom: 10 }]}>
              <Icon name={full ? 'compress' : 'expand'} size={14} color={C.white} />
            </Pressable>
          )}
        </View>
      </View>
      {!full && !!x && (
        <DiscussionView
          lectureId={x.id}
          header={(
            <View style={{ paddingTop: 12 }}>
              <Text style={st.vTitle}>{x.title}</Text>
              <Row style={{ marginVertical: 8 }}>
                <Pill text={x.subjects?.name || 'Subject'} />
                <Pill text={x.is_live ? 'Live lecture' : 'Recorded lecture'} active={x.is_live} />
              </Row>
              <Label>{fmtDateTime(x.created_at)}</Label>
              {!!x.description && <Text style={st.vDesc}>{x.description}</Text>}
              {x.downloadable && x.file_path && (
                <Btn kind="yellow" icon="download" label="Download lecture" style={{ marginTop: 12 }} onPress={() => downloadAndShare(x.file_path, x.title).catch((e) => toast(e.message, 'error'))} />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

/* ----------------------------- file viewer (notes / homework) ----------------------------- */
export function FileViewer({ visible, onClose, title, path, type }) {
  const { toast } = useUi();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!visible || !path) return;
    setUrl(null); setFailed(false);
    signedUrl(path, 3600).then((u) => (u ? setUrl(u) : setFailed(true)));
  }, [visible, path]);
  const ext = (type || (path || '').split('.').pop() || '').toLowerCase();
  const isPdf = ext.includes('pdf');
  return (
    <Sheet visible={visible} onClose={onClose} title={title || 'File'}
      footer={<><Btn small kind="ghost" icon="arrow-up-right-from-square" label="Open outside" disabled={!url} onPress={() => Linking.openURL(url)} />
        <Btn small icon="download" label="Download" onPress={() => downloadAndShare(path, title).catch((e) => toast(e.message, 'error'))} /></>}>
      {failed ? <Empty icon="file-circle-xmark" title="Could not open file" /> : !url ? <Loading /> : isPdf ? (
        <View style={{ height: 520, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
          <WebView source={{ uri: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}` }} startInLoadingState
            renderLoading={() => <Loading text="Loading PDF…" />} javaScriptEnabled />
        </View>
      ) : (
        <Image source={{ uri: url }} style={{ width: '100%', height: 460 }} resizeMode="contain" />
      )}
    </Sheet>
  );
}

/* ----------------------------- Notes ----------------------------- */
function NoteItem({ x, onOpen, toast, showSubject }) {
  return (
    <ListItem title={x.title} sub={`${showSubject ? `${x.subjects?.name || 'Subject'} • ` : ''}${String(x.file_type || 'file').toUpperCase()} • ${fmtDate(x.created_at)}`}
      left={<View style={st.play}><Icon name={String(x.file_type).includes('pdf') ? 'file-pdf' : 'file-image'} size={15} color={C.white} /></View>}
      right={<Pressable hitSlop={10} onPress={() => downloadAndShare(x.file_path, x.title).catch((e) => toast(e.message, 'error'))}><Icon name="download" size={15} /></Pressable>}
      onPress={() => onOpen(x)} />
  );
}
export function Notes({ nav }) {
  const { classNo } = useApp();
  const { toast } = useUi();
  const [open, setOpen] = useState(null);
  useDayKey();
  const q = useAsync(async () => {
    const { data, error } = await sb.from('notes').select('*,subjects(name)').eq('class_no', classNo).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [classNo]);
  useRealtimeTables(['notes'], classNo, q.reload);
  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Async q={q}>
        {(rows) => {
          const today = rows.filter((x) => isToday(x.created_at));
          return (
            <>
              <SectionHead title="Today's Notes" icon="note-sticky" count={today.length} />
              {today.length ? today.map((x) => <NoteItem key={x.id} x={x} showSubject onOpen={setOpen} toast={toast} />) : <TodayEmpty icon="note-sticky" text="No new notes today" sub="New study material appears here automatically." />}
              {rows.length === 0 ? <Empty icon="note-sticky" title="No notes yet" text="Your class notes will appear here." /> : (
                <>
                  <Text style={st.chooseText}>Choose a subject to open PDFs and images without leaving the app.</Text>
                  <SubjectGrid rows={rows} unit="file(s)" blurb="Lecture notes" onOpen={(id) => nav.push('notes-subject', { subjectId: id })} />
                </>
              )}
              <FileViewer visible={!!open} onClose={() => setOpen(null)} title={open?.title} path={open?.file_path} type={open?.file_type} />
            </>
          );
        }}
      </Async>
    </Page>
  );
}
export function NotesSubject({ params }) {
  const { classNo } = useApp();
  const { toast } = useUi();
  const [open, setOpen] = useState(null);
  const q = useAsync(async () => {
    const { data, error } = await sb.from('notes').select('*,subjects(name)').eq('class_no', classNo).eq('subject_id', params.subjectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [params.subjectId]);
  useRealtimeTables(['notes'], classNo, q.reload);
  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {(rows) => (
          <>
            <Head title={rows[0]?.subjects?.name || 'Notes'} sub="Open or download a note." />
            {rows.length ? rows.map((x) => <NoteItem key={x.id} x={x} onOpen={setOpen} toast={toast} />) : <Empty icon="note-sticky" title="No notes yet" />}
            <FileViewer visible={!!open} onClose={() => setOpen(null)} title={open?.title} path={open?.file_path} type={open?.file_type} />
          </>
        )}
      </Async>
    </Page>
  );
}

/* ----------------------------- Homework ----------------------------- */
function HomeworkItem({ x, onOpen, toast, showSubject }) {
  return (
    <Card>
      {showSubject && <View style={{ alignSelf: 'flex-start', marginBottom: 6 }}><Pill text={x.subjects?.name || 'Subject'} /></View>}
      <Text style={st.vTitle}>{x.title}</Text>
      <Text style={st.vDesc}>{x.instructions || 'No extra instructions.'}</Text>
      <Label style={{ marginTop: 8 }}>Posted {fmtDate(x.created_at)}{x.due_date ? ` • Due ${fmtDate(x.due_date)}` : ''}</Label>
      {!!x.file_path && (
        <Row style={{ marginTop: 12 }}>
          <Btn small label="Open file" icon="eye" onPress={() => onOpen(x)} />
          <Btn small kind="ghost" label="Download" icon="download" onPress={() => downloadAndShare(x.file_path, x.title).catch((e) => toast(e.message, 'error'))} />
        </Row>
      )}
    </Card>
  );
}
export function Homework({ nav }) {
  const { classNo } = useApp();
  const { toast } = useUi();
  const [open, setOpen] = useState(null);
  useDayKey();
  const q = useAsync(async () => {
    const { data, error } = await sb.from('homework').select('*,subjects(name)').eq('class_no', classNo).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [classNo]);
  useRealtimeTables(['homework'], classNo, q.reload);
  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Async q={q}>
        {(rows) => {
          const today = rows.filter((x) => isToday(x.created_at)); // published today (not "due today")
          return (
            <>
              <SectionHead title="Today's Homework" icon="book-open" count={today.length} />
              {today.length ? today.map((x) => <HomeworkItem key={x.id} x={x} showSubject onOpen={setOpen} toast={toast} />) : <TodayEmpty icon="book-open" text="No homework assigned today" sub="New assignments appear here automatically." />}
              {rows.length === 0 ? <Empty icon="book-open" title="No homework yet" text="Homework will appear here when assigned." /> : (
                <>
                  <Text style={st.chooseText}>Choose a subject to view homework, PDFs, images and instructions.</Text>
                  <SubjectGrid rows={rows} unit="item(s)" blurb="Assigned homework" onOpen={(id) => nav.push('homework-subject', { subjectId: id })} />
                </>
              )}
              <FileViewer visible={!!open} onClose={() => setOpen(null)} title={open?.title} path={open?.file_path} />
            </>
          );
        }}
      </Async>
    </Page>
  );
}
export function HomeworkSubject({ params }) {
  const { classNo } = useApp();
  const { toast } = useUi();
  const [open, setOpen] = useState(null);
  const q = useAsync(async () => {
    const { data, error } = await sb.from('homework').select('*,subjects(name)').eq('class_no', classNo).eq('subject_id', params.subjectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [params.subjectId]);
  useRealtimeTables(['homework'], classNo, q.reload);
  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {(rows) => (
          <>
            <Head title={rows[0]?.subjects?.name || 'Homework'} sub="Instructions and attached files." />
            {rows.length ? rows.map((x) => <HomeworkItem key={x.id} x={x} onOpen={setOpen} toast={toast} />) : <Empty icon="book-open" title="No homework yet" />}
            <FileViewer visible={!!open} onClose={() => setOpen(null)} title={open?.title} path={open?.file_path} />
          </>
        )}
      </Async>
    </Page>
  );
}

/* ----------------------------- AI Study Hub ----------------------------- */
const GROUPS = [
  ['notes', 'note-sticky', 'Notes & summaries'],
  ['lecture', 'video', 'Lectures'],
  ['doubt', 'circle-question', 'Doubt solving'],
  ['ai', 'wand-magic-sparkles', 'AI study assistant'],
];
export function NotebookLM() {
  const { classNo } = useApp();
  const { toast } = useUi();
  const q = useAsync(async () => {
    const { data, error } = await sb.from('notebooklm_resources').select('*,subjects(name)').eq('class_no', classNo).eq('is_active', true).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [classNo]);
  const open = async (url) => {
    if (!url) return toast('This AI resource has no URL.', 'error');
    try { await Linking.openURL(url); } catch { toast('Could not open the link.', 'error'); }
  };
  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="AI Study Hub" sub="NotebookLM / Gemini study resources published for your class." />
      <View style={st.aiBanner}>
        <View style={{ flex: 1 }}>
          <Pill text="BCC AI LEARNING" active />
          <Text style={st.aiTitle}>Study smarter with your class resources</Text>
          <Text style={st.aiSub}>Notes, lectures, doubt-solving and AI study links selected by BCC.</Text>
        </View>
        <Icon name="wand-magic-sparkles" size={34} color={C.accent} />
      </View>
      <Async q={q}>
        {(rows) => GROUPS.map(([type, icon, label]) => {
          const items = rows.filter((r) => r.resource_type === type);
          return (
            <View key={type} style={{ marginBottom: 6 }}>
              <View style={st.grpHead}><Icon name={icon} size={14} /><Text style={st.grpTitle}>{label}</Text><Pill text={String(items.length)} /></View>
              {items.length ? items.map((r) => (
                <Card key={r.id}>
                  <Pill text={r.subjects?.name || 'Class resource'} />
                  <Text style={[st.vTitle, { marginTop: 6 }]}>{r.title}</Text>
                  {!!r.description && <Text style={st.vDesc}>{r.description}</Text>}
                  <Btn small icon="arrow-up-right-from-square" label="Open Gemini" onPress={() => open(r.url)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
                </Card>
              )) : <Text style={st.muted}>No resources in this category yet.</Text>}
            </View>
          );
        })}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  secRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 },
  secIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  secTitle: { fontFamily: F.b, fontSize: 16, color: C.primary },
  secDate: { fontFamily: F.m, fontSize: 11, color: C.grey },
  chooseText: { fontFamily: F.r, fontSize: 12.5, color: C.grey, marginTop: 14, marginBottom: 12 },
  todayEmpty: { alignItems: 'center', backgroundColor: C.white, borderRadius: R.md, paddingVertical: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', marginBottom: 6 },
  todayEmptyIc: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  todayEmptyT: { fontFamily: F.s, fontSize: 14, color: C.primary },
  todayEmptyS: { fontFamily: F.r, fontSize: 11.5, color: C.grey, marginTop: 2, textAlign: 'center' },
  shield: { position: 'absolute', backgroundColor: 'transparent' },
  fsBtn: { position: 'absolute', right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cTitle: { flex: 1, fontFamily: F.b, fontSize: 16, color: C.primary },
  cBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: C.white, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, padding: 8 },
  cInput: { flex: 1, fontFamily: F.r, fontSize: 13.5, color: C.black, maxHeight: 100, paddingHorizontal: 6, paddingVertical: 6 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  cRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'flex-start' },
  cName: { fontFamily: F.s, fontSize: 12.5, color: C.primary },
  cTime: { fontFamily: F.r, fontSize: 10.5, color: C.grey },
  cBody: { fontFamily: F.r, fontSize: 13, color: C.black, marginTop: 2, lineHeight: 19 },
  subIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  subName: { fontFamily: F.b, fontSize: 14, color: C.primary },
  subBlurb: { fontFamily: F.r, fontSize: 11, color: C.grey, marginTop: 2 },
  subCount: { fontFamily: F.s, fontSize: 11, color: C.primary, marginTop: 8, backgroundColor: C.soft, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  sec: { fontFamily: F.b, fontSize: 16, color: C.primary, marginTop: 18, marginBottom: 10 },
  play: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  vTitle: { fontFamily: F.b, fontSize: 16, color: C.primary },
  vDesc: { fontFamily: F.r, fontSize: 13, color: C.grey, marginTop: 6, lineHeight: 20 },
  aiBanner: { backgroundColor: C.primary, borderRadius: R.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  aiTitle: { fontFamily: F.b, fontSize: 16, color: C.white, marginTop: 8 },
  aiSub: { fontFamily: F.r, fontSize: 11.5, color: C.soft, marginTop: 4 },
  grpHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  grpTitle: { flex: 1, fontFamily: F.b, fontSize: 15, color: C.primary },
  muted: { fontFamily: F.r, fontSize: 12, color: C.grey, marginBottom: 8 },
});
