import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Card, Icon, Loading, Pill } from './ui';
import { useApp, useUi } from '../lib/app';
import { sb } from '../lib/supabase';
import { isMissingTable, timeAgo, useAsync } from '../lib/helpers';
import { C, F } from '../theme';

const ROLE = { teacher: 'Teacher', admin: 'Admin' };

/**
 * Lecture discussion: everyone in the class (and the teachers/admin of that class) sees the same thread.
 * Students can comment and reply; teachers/admin can reply and delete any comment (moderator).
 * Table: lecture_comments (+ parent_id for replies — supabase/APP_FEATURES_2_REPLIES.sql).
 */
export default function Discussion({ lectureId, moderator = false }) {
  const { profile } = useApp();
  const { toast } = useUi();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);

  const q = useAsync(async () => {
    let flat = false;
    const cols = 'id,user_id,parent_id,author_name,author_role,body,created_at';
    let res = await sb.from('lecture_comments').select(cols).eq('lecture_id', lectureId).order('created_at', { ascending: true }).limit(400);
    if (res.error && /parent_id/i.test(res.error.message || '')) {
      flat = true; // replies SQL not run yet -> plain list
      res = await sb.from('lecture_comments').select('id,user_id,author_name,author_role,body,created_at').eq('lecture_id', lectureId).order('created_at', { ascending: true }).limit(400);
    }
    if (res.error) { if (isMissingTable(res.error)) return { missing: true, flat, rows: [] }; throw res.error; }
    return { missing: false, flat, rows: res.data || [] };
  }, [lectureId]);

  const { tops, replies } = useMemo(() => {
    const rows = q.data?.rows || [];
    const map = {};
    rows.filter((r) => r.parent_id).forEach((r) => { (map[r.parent_id] = map[r.parent_id] || []).push(r); });
    return { tops: rows.filter((r) => !r.parent_id).reverse(), replies: map }; // newest thread first, replies oldest first
  }, [q.data]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const payload = { lecture_id: lectureId, user_id: profile.id, body };
      if (replyTo && !q.data?.flat) payload.parent_id = replyTo.parent_id || replyTo.id;
      const { error } = await sb.from('lecture_comments').insert(payload);
      if (error) throw error;
      setText(''); setReplyTo(null); q.reload();
    } catch (e) { toast(e.message || 'Could not post.', 'error'); } finally { setSending(false); }
  };
  const remove = (c) => Alert.alert('Delete comment?', c.parent_id ? '' : 'Its replies will be deleted too.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
    const { error } = await sb.from('lecture_comments').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    q.reload();
  } }]);

  const item = (c, child = false) => (
    <View style={[st.row, child && st.child]}>
      <Avatar name={c.author_name} size={child ? 28 : 34} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={st.name}>{c.author_name || 'Student'}</Text>
          {ROLE[c.author_role] && <Pill active text={ROLE[c.author_role]} />}
          <Text style={st.time}>{timeAgo(c.created_at)}</Text>
        </View>
        <Text style={st.body}>{c.body}</Text>
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
          {!q.data?.flat && <Pressable hitSlop={8} onPress={() => setReplyTo(c)}><Text style={st.act}>Reply</Text></Pressable>}
          {(c.user_id === profile.id || moderator) && <Pressable hitSlop={8} onPress={() => remove(c)}><Text style={[st.act, { color: C.alert }]}>Delete</Text></Pressable>}
        </View>
      </View>
    </View>
  );

  const total = (q.data?.rows || []).length;
  return (
    <View style={{ marginTop: 18 }}>
      <View style={st.head}><Icon name="comments" size={15} /><Text style={st.title}>Discussion</Text><Pill text={String(total)} /></View>
      {q.data?.missing ? (
        <Card><Text style={st.muted}>Comments are not enabled yet. Ask your teacher.</Text></Card>
      ) : (
        <>
          <Text style={[st.muted, { marginBottom: 8 }]}>{moderator ? 'You can reply to students and delete any comment.' : 'Everyone in your class can see these comments. Teachers will reply to doubts.'}</Text>
          {replyTo && (
            <View style={st.replying}>
              <Text style={st.replyingT} numberOfLines={1}>Replying to {replyTo.author_name || 'comment'}</Text>
              <Pressable hitSlop={10} onPress={() => setReplyTo(null)}><Icon name="xmark" size={13} /></Pressable>
            </View>
          )}
          <View style={st.box}>
            <TextInput value={text} onChangeText={setText} placeholder={replyTo ? 'Write a reply…' : 'Ask a doubt or share your thoughts…'} placeholderTextColor="#8a8a8a" multiline maxLength={500} style={st.input} />
            <Pressable onPress={send} disabled={sending || !text.trim()} style={[st.send, (!text.trim() || sending) && { opacity: 0.4 }]}>
              <Icon name="paper-plane" size={14} color={C.accent} />
            </Pressable>
          </View>
          {q.loading && !q.data ? <Loading /> : tops.length === 0 ? (
            <Text style={[st.muted, { textAlign: 'center', marginTop: 12 }]}>No comments yet. Be the first to comment.</Text>
          ) : tops.map((c) => (
            <View key={c.id}>
              {item(c)}
              {(replies[c.id] || []).map((r) => <React.Fragment key={r.id}>{item(r, true)}</React.Fragment>)}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { flex: 1, fontFamily: F.b, fontSize: 16, color: C.primary },
  muted: { fontFamily: F.r, fontSize: 11.5, color: C.grey },
  box: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: C.white, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, padding: 8 },
  input: { flex: 1, fontFamily: F.r, fontSize: 13.5, color: C.black, maxHeight: 100, paddingHorizontal: 6, paddingVertical: 6 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  replying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.soft, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 6 },
  replyingT: { flex: 1, fontFamily: F.s, fontSize: 12, color: C.primary },
  row: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'flex-start' },
  child: { marginLeft: 44, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.line, marginTop: 10 },
  name: { fontFamily: F.s, fontSize: 12.5, color: C.primary },
  time: { fontFamily: F.r, fontSize: 10.5, color: C.grey },
  body: { fontFamily: F.r, fontSize: 13, color: C.black, marginTop: 2, lineHeight: 19 },
  act: { fontFamily: F.s, fontSize: 11.5, color: C.primary },
});
