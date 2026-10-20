import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Card, Icon, Loading, Pill } from './ui';
import { useMyPhoto } from './HomeHeader';
import { useApp, useUi } from '../lib/app';
import { sb } from '../lib/supabase';
import { isMissingTable, timeAgo, useAsync } from '../lib/helpers';
import { C, F } from '../theme';

/**
 * Threaded lecture discussion (Instagram / Reddit style).
 *  - true parent->child replies (lecture_comments.parent_id), unlimited depth in the database,
 *    the visual indent is capped so deep threads stay readable on phones
 *  - bottom "Join the Discussion" composer; tapping Reply hides it and opens an inline composer
 *    under the selected comment (auto-focused, with an automatic @mention)
 *  - real portal photos through get_lecture_discussion_avatars() (initials fallback)
 *  - FlatList virtualisation for long threads
 */
const COLS = 'id,user_id,parent_id,author_name,author_role,body,created_at';
const COLS_FLAT = 'id,user_id,author_name,author_role,body,created_at';
const ROLE = { teacher: 'Teacher', admin: 'Admin' };
const MAX_VISUAL = 4;          // deepest visual indent level
const STEP = 24;               // horizontal distance between levels
const AV_TOP = 34;             // avatar size of top-level comments
const AV_REPLY = 28;           // avatar size of replies
const PAD_TOP = 8;             // reply row top padding (connector curve ends at the avatar centre)
const LINE = '#D8D5EA';
const X = (k) => 17 + k * STEP; // x of the vertical thread line that belongs to level k

/* ---------------- tree helpers ---------------- */
function createsCycle(r, byId) {
  const seen = new Set();
  let p = r.parent_id;
  while (p) {
    if (p === r.id || seen.has(p)) return true;
    seen.add(p);
    p = byId.get(p)?.c.parent_id;
  }
  return false;
}
function buildTree(rows) {
  const byId = new Map(rows.map((r) => [r.id, { c: r, children: [], count: 0 }]));
  const roots = [];
  rows.forEach((r) => {
    const node = byId.get(r.id);
    const parent = r.parent_id ? byId.get(r.parent_id) : null;
    if (parent && parent !== node && !createsCycle(r, byId)) parent.children.push(node);
    else roots.push(node); // top-level (or an orphan / invalid link)
  });
  const count = (n) => { n.count = n.children.reduce((s, ch) => s + 1 + count(ch), 0); return n.count; };
  roots.forEach(count);
  return { roots: roots.reverse() }; // newest thread first, replies keep chronological order
}
function flatten(nodes, depth, anc, out, isOpen, seen) {
  nodes.forEach((n, i) => {
    if (seen.has(n.c.id)) return; // never render a comment twice
    seen.add(n.c.id);
    const last = i === nodes.length - 1;
    const open = n.children.length > 0 && isOpen(n);
    out.push({ key: n.c.id, c: n.c, depth, anc, last, hasKids: n.children.length > 0, open, count: n.count });
    if (open) flatten(n.children, depth + 1, depth >= 1 ? [...anc, !last] : [], out, isOpen, seen);
  });
}
/** ids of every ancestor of `c` so a freshly posted nested reply is visible. */
function ancestorsOpen(rows, c) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = {};
  let p = c; let guard = 0;
  while (p && guard++ < 200) { out[p.id] = true; p = p.parent_id ? byId.get(p.parent_id) : null; }
  return out;
}

/* ---------------- safe @mention rendering (plain Text, names may contain spaces) ---------------- */
function MentionText({ text, names, style }) {
  const parts = useMemo(() => {
    const out = [];
    let buf = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '@') {
        const hit = names.find((n) => text.substr(i + 1, n.length) === n && !/[A-Za-z0-9]/.test(text[i + 1 + n.length] || ' '));
        if (hit) {
          if (buf) out.push({ t: buf });
          buf = '';
          out.push({ t: `@${hit}`, m: true });
          i += hit.length + 1;
          continue;
        }
      }
      buf += text[i];
      i += 1;
    }
    if (buf) out.push({ t: buf });
    return out;
  }, [text, names]);
  return (
    <Text style={style}>
      {parts.map((p, k) => (p.m ? <Text key={k} style={st.mention}>{p.t}</Text> : <Text key={k}>{p.t}</Text>))}
    </Text>
  );
}

/* ---------------- one comment / reply row ---------------- */
const Row = memo(function Row({ item, names, avatarUrl, myId, myPhoto, moderator, flat, replying, draft, sending, onDraft, onReply, onCancel, onSend, onDelete, onToggle }) {
  const { c, depth, anc, last, hasKids, open, count } = item;
  const vd = Math.min(depth, MAX_VISUAL);
  const av = depth === 0 ? AV_TOP : AV_REPLY;
  const topPad = depth === 0 ? 14 : PAD_TOP;
  const left = depth === 0 ? 0 : X(vd) - av / 2;
  const ancV = depth > 1 ? anc.slice(-(vd - 1)) : [];
  const canDelete = c.user_id === myId || moderator;

  return (
    <View style={[st.row, { paddingTop: topPad }]}>
      {/* thread lines of ancestors that still have later siblings */}
      {ancV.map((on, j) => (on ? <View key={`a${j}`} style={[st.vline, { left: X(j) - 1, top: 0, bottom: 0 }]} /> : null))}
      {/* curved connector from the parent's line to this avatar */}
      {depth >= 1 && (
        <>
          <View style={[st.curve, { left: X(vd - 1) - 1, top: 0, width: X(vd) - av / 2 - X(vd - 1) + 1, height: PAD_TOP + av / 2 }]} />
          {!last && <View style={[st.vline, { left: X(vd - 1) - 1, top: PAD_TOP + av / 2, bottom: 0 }]} />}
        </>
      )}
      {/* line from this avatar down to its visible replies */}
      {hasKids && open && <View style={[st.vline, { left: X(vd) - 1, top: topPad + av, bottom: 0 }]} />}

      <View style={{ marginLeft: left, flexDirection: 'row', gap: 10 }}>
        <Avatar uri={avatarUrl} name={c.author_name} size={av} />
        <View style={{ flex: 1 }}>
          <View style={st.head}>
            <Text style={st.name} numberOfLines={1}>{c.author_name || 'Student'}</Text>
            {ROLE[c.author_role] && <Pill active text={ROLE[c.author_role]} />}
            <Text style={st.time}>{timeAgo(c.created_at)}</Text>
          </View>
          <MentionText text={c.body} names={names} style={st.body} />
          <View style={st.actions}>
            {!flat && <Pressable hitSlop={8} onPress={() => onReply(c)}><Text style={st.act}>Reply</Text></Pressable>}
            {canDelete && <Pressable hitSlop={8} onPress={() => onDelete(c)}><Text style={[st.act, { color: C.alert }]}>Delete</Text></Pressable>}
          </View>

          {replying && (
            <View style={st.inline}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Avatar uri={myPhoto} name="Me" size={26} />
                <TextInput
                  autoFocus value={draft} onChangeText={onDraft} multiline maxLength={500}
                  placeholder="Write a reply..." placeholderTextColor="#8a8a8a" style={st.inlineInput}
                />
              </View>
              <View style={st.inlineBtns}>
                <Pressable onPress={onCancel} hitSlop={8} style={st.cancel}><Text style={st.cancelT}>Cancel</Text></Pressable>
                <Pressable onPress={onSend} disabled={sending || !draft.trim()} style={[st.sendPill, (sending || !draft.trim()) && { opacity: 0.45 }]}>
                  <Icon name="arrow-up" size={11} color={C.primary} />
                  <Text style={st.sendT}>Send Reply</Text>
                </Pressable>
              </View>
            </View>
          )}

          {hasKids && (
            <Pressable hitSlop={8} onPress={() => onToggle(c.id, !open)} style={st.toggle}>
              <View style={st.toggleLine} />
              <Text style={st.toggleT}>{open ? 'Hide replies' : `View ${count} repl${count === 1 ? 'y' : 'ies'}`}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

/* ---------------- the whole discussion screen ---------------- */
export default function DiscussionView({ lectureId, moderator = false, header = null, stickyLectureHeader = false }) {
  const { profile } = useApp();
  const { toast } = useUi();
  const myPhoto = useMyPhoto();
  const listRef = useRef(null);
  const mainRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState({});   // id -> true/false (overrides the default)
  const [replyTo, setReplyTo] = useState(null);   // comment being replied to
  const [draft, setDraft] = useState('');
  const [text, setText] = useState('');           // main composer
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [avatarMap, setAvatarMap] = useState({});
  const [scrollTo, setScrollTo] = useState(null);
  const colsRef = useRef(COLS);

  const q = useAsync(async () => {
    let flat = false;
    colsRef.current = COLS;
    let res = await sb.from('lecture_comments').select(COLS).eq('lecture_id', lectureId).order('created_at', { ascending: true }).limit(1000);
    if (res.error && /parent_id/i.test(res.error.message || '')) {
      flat = true; colsRef.current = COLS_FLAT; // reply SQL not run yet -> plain list
      res = await sb.from('lecture_comments').select(COLS_FLAT).eq('lecture_id', lectureId).order('created_at', { ascending: true }).limit(1000);
    }
    if (res.error) { if (isMissingTable(res.error)) return { missing: true, flat, rows: [] }; throw res.error; }
    return { missing: false, flat, rows: res.data || [] };
  }, [lectureId], { key: `comments:${lectureId}` });

  useEffect(() => { if (q.data) setRows(q.data.rows); }, [q.data]);

  // live updates from other students / teachers
  useEffect(() => {
    const ch = sb.channel(`disc-${lectureId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lecture_comments', filter: `lecture_id=eq.${lectureId}` }, () => q.refresh())
      .subscribe();
    return () => { try { sb.removeChannel(ch); } catch (_) {} };
  }, [lectureId]);

  // real portal photos (students / teachers / admins)
  const fetchedFor = useRef('');
  useEffect(() => {
    const ids = [...new Set(rows.map((r) => r.user_id))].sort().join(',');
    if (!ids || fetchedFor.current === ids) return;
    fetchedFor.current = ids;
    (async () => {
      try {
        const { data, error } = await sb.rpc('get_lecture_discussion_avatars', { p_lecture_id: lectureId });
        if (error || !data?.length) return;
        const paths = [...new Set(data.map((x) => x.photo_path).filter(Boolean))];
        const { data: urls } = await sb.storage.from('student-photos').createSignedUrls(paths, 3600);
        const m = {};
        data.forEach((x) => { const u = urls?.[paths.indexOf(x.photo_path)]?.signedUrl; if (u) m[x.user_id] = u; });
        setAvatarMap((p) => ({ ...p, ...m }));
      } catch (_) { /* initials fallback */ }
    })();
  }, [rows, lectureId]);

  const flat = !!q.data?.flat;
  const { roots } = useMemo(() => buildTree(rows), [rows]);
  const names = useMemo(() => [...new Set(rows.map((r) => r.author_name).filter(Boolean))].sort((a, b) => b.length - a.length), [rows]);
  const items = useMemo(() => {
    const out = [];
    flatten(roots, 0, [], out, (n) => (expanded[n.c.id] !== undefined ? expanded[n.c.id] : n.count <= 3), new Set());
    return out;
  }, [roots, expanded]);

  const onToggle = useCallback((id, open) => setExpanded((p) => ({ ...p, [id]: open })), []);

  /* ----- reply flow ----- */
  const startReply = useCallback((c) => {
    setReplyTo(c);
    setDraft(c.user_id === profile.id ? '' : `@${c.author_name || 'Student'} `); // automatic mention (not when replying to yourself)
    setScrollTo(c.id);
  }, [profile.id]);
  const cancelReply = useCallback(() => { setReplyTo(null); setDraft(''); Keyboard.dismiss(); }, []);

  useEffect(() => {
    if (!scrollTo) return undefined;
    const go = () => {
      const index = items.findIndex((x) => x.key === scrollTo);
      if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: replyTo ? 0.2 : 0.5, animated: true });
    };
    const t = setTimeout(go, 160);
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(go, 60)); // keeps the composer above the keyboard
    const t2 = setTimeout(() => setScrollTo(null), 900);
    return () => { clearTimeout(t); clearTimeout(t2); sub.remove(); };
  }, [scrollTo]);

  const post = useCallback(async (parent, body, reset) => {
    const clean = body.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      const payload = { lecture_id: lectureId, user_id: profile.id, body: clean };
      if (parent && !flat) payload.parent_id = parent.id;
      const { data, error } = await sb.from('lecture_comments').insert(payload).select(colsRef.current).single();
      if (error) throw error;
      setRows((p) => (p.some((x) => x.id === data.id) ? p : [...p, data])); // appears instantly in the right place
      if (parent) setExpanded((p) => ({ ...p, ...ancestorsOpen(rows, parent) }));
      reset();
      Keyboard.dismiss();
      setScrollTo(data.id);
    } catch (e) {
      toast(e.message || 'Could not post. Your text is kept - try again.', 'error'); // the draft is preserved
    } finally { setSending(false); }
  }, [sending, lectureId, profile.id, flat, rows]);

  const sendReply = useCallback(() => post(replyTo, draft, () => { setReplyTo(null); setDraft(''); }), [post, replyTo, draft]);
  const sendMain = useCallback(() => post(null, text, () => setText('')), [post, text]);

  const remove = useCallback((c) => Alert.alert('Delete comment?', 'Its replies will be deleted too.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      const { error } = await sb.from('lecture_comments').delete().eq('id', c.id);
      if (error) return toast(error.message, 'error');
      if (replyTo?.id === c.id) cancelReply();
      q.reload();
    } },
  ]), [replyTo, cancelReply]);

  const renderItem = useCallback(({ item }) => {
    const replying = replyTo?.id === item.key;
    return (
      <Row
        item={item} names={names} avatarUrl={avatarMap[item.c.user_id] || (item.c.user_id === profile.id ? myPhoto : '')}
        myId={profile.id} myPhoto={myPhoto} moderator={moderator} flat={flat}
        replying={replying} draft={replying ? draft : ''} sending={sending}
        onDraft={setDraft} onReply={startReply} onCancel={cancelReply} onSend={sendReply} onDelete={remove} onToggle={onToggle}
      />
    );
  }, [replyTo, draft, sending, names, avatarMap, myPhoto, profile.id, moderator, flat, startReply, cancelReply, sendReply, remove, onToggle]);

  // main composer lives at the TOP of the discussion (YouTube style); hidden while an inline reply is open
  const mainComposer = !replyTo ? (
    <View style={st.composer}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Avatar uri={myPhoto} name={profile.full_name} size={36} />
        <TextInput
          ref={mainRef} value={text} onChangeText={setText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="Write a comment..." placeholderTextColor="#8a8a8a" multiline maxLength={500} style={st.input}
        />
      </View>
      {(focused || !!text.trim()) && (
        <View style={st.composerBtns}>
          <Pressable onPress={() => { setText(''); mainRef.current?.blur(); Keyboard.dismiss(); }} hitSlop={8} style={st.cancel}>
            <Text style={st.cancelT}>Cancel</Text>
          </Pressable>
          <Pressable onPress={sendMain} disabled={sending || !text.trim()} style={[st.sendBtn, (sending || !text.trim()) && { opacity: 0.45 }]}>
            <Icon name="arrow-up" size={12} color={C.accent} />
            <Text style={st.sendBtnT}>Send Comment</Text>
          </Pressable>
        </View>
      )}
    </View>
  ) : null;

  // Only the lecture media and metadata stay pinned. Discussion content scrolls underneath.
  const listHeader = (
    <View style={stickyLectureHeader ? { backgroundColor: C.bg, zIndex: 5, elevation: 0 } : null}>
      {header}
      {!stickyLectureHeader && <>
        <View style={st.discHead}><Icon name="comments" size={15} /><Text style={st.discTitle}>Discussion</Text><Pill text={String(rows.length)} /></View>
        <Text style={st.hint}>{moderator ? 'Reply to students and moderate comments.' : 'Everyone in your class can see these comments. Teachers will reply to doubts.'}</Text>
        {mainComposer}
      </>}
    </View>
  );
  const scrollingItems = stickyLectureHeader ? [{ key: '__discussion_intro__' }, ...items] : items;

  if (q.data?.missing) {
    return <View style={{ flex: 1, padding: 16 }}>{header}<Card><Text style={st.hint}>Comments are not enabled yet. Ask your teacher.</Text></Card></View>;
  }
  return (
    <View style={{ flex: 1 }}>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={listRef}
        data={scrollingItems}
        keyExtractor={(it) => it.key}
        renderItem={stickyLectureHeader ? (props) => props.item.key === '__discussion_intro__' ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View style={st.discHead}><Icon name="comments" size={15} /><Text style={st.discTitle}>Discussion</Text><Pill text={String(rows.length)} /></View>
            <Text style={st.hint}>{moderator ? 'Reply to students and moderate comments.' : 'Everyone in your class can see these comments. Teachers will reply to doubts.'}</Text>
            {mainComposer}
          </View>
        ) : <View style={{ paddingHorizontal: 16 }}>{renderItem(props)}</View> : renderItem}
        extraData={[replyTo?.id, draft, expanded, avatarMap, sending]}
        ListHeaderComponent={listHeader}
        stickyHeaderIndices={stickyLectureHeader ? [0] : undefined}
        ListEmptyComponent={q.loading && !q.data ? <Loading /> : <Text style={[st.hint, { textAlign: 'center', marginTop: 14 }]}>No comments yet. Be the first to comment.</Text>}
        contentContainerStyle={{ paddingHorizontal: stickyLectureHeader ? 0 : 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={8}
        removeClippedSubviews={false}
        onScrollToIndexFailed={(info) => setTimeout(() => listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: true }), 120)}
      />

    </View>
  );
}

const st = StyleSheet.create({
  row: { position: 'relative' },
  vline: { position: 'absolute', width: 2, backgroundColor: LINE },
  curve: { position: 'absolute', borderLeftWidth: 2, borderBottomWidth: 2, borderColor: LINE, borderBottomLeftRadius: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontFamily: F.s, fontSize: 12.5, color: C.primary, maxWidth: '60%' },
  time: { fontFamily: F.r, fontSize: 10.5, color: C.grey },
  body: { fontFamily: F.r, fontSize: 13, color: C.black, marginTop: 2, lineHeight: 19 },
  mention: { fontFamily: F.s, color: C.primary, backgroundColor: C.soft },
  actions: { flexDirection: 'row', gap: 18, marginTop: 6 },
  act: { fontFamily: F.s, fontSize: 11.5, color: C.primary },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  toggleLine: { width: 18, height: 2, backgroundColor: LINE },
  toggleT: { fontFamily: F.s, fontSize: 11.5, color: C.grey },
  inline: { marginTop: 10, backgroundColor: C.white, borderRadius: 14, borderWidth: 1.5, borderColor: C.primary, padding: 8 },
  inlineInput: { flex: 1, fontFamily: F.r, fontSize: 13, color: C.black, maxHeight: 96, paddingVertical: 2, paddingHorizontal: 4 },
  inlineBtns: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 6 },
  cancel: { paddingVertical: 6, paddingHorizontal: 8 },
  cancelT: { fontFamily: F.s, fontSize: 12, color: C.grey },
  sendPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 14 },
  sendT: { fontFamily: F.s, fontSize: 12, color: C.primary },
  discHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 4 },
  discTitle: { flex: 1, fontFamily: F.b, fontSize: 16, color: C.primary },
  hint: { fontFamily: F.r, fontSize: 11.5, color: C.grey, marginBottom: 4 },
  composer: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 10, marginTop: 8, marginBottom: 4 },
  composerBtns: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 10 },
  input: { flex: 1, minHeight: 40, maxHeight: 110, backgroundColor: C.bg, borderRadius: 20, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 8, fontFamily: F.r, fontSize: 13.5, color: C.black },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 16 },
  sendBtnT: { fontFamily: F.s, fontSize: 12.5, color: C.white },
});
