import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Btn, Card, Empty, Head, Icon, Loading, Page } from '../../components/ui';
import { useNotif } from '../../lib/notifications';
import { timeAgo } from '../../lib/helpers';
import { C, F } from '../../theme';

const KIND = {
  lecture: ['video', C.lav], note: ['note-sticky', C.sun], homework: ['book-open', C.mint],
  quiz: ['circle-question', C.blush], ai: ['wand-magic-sparkles', C.mint], result: ['file-signature', C.lav], general: ['bullhorn', C.sun],
};

export default function Notifications({ nav }) {
  const { items, unread, loading, refresh, markRead, markAllRead } = useNotif();

  const open = async (n) => {
    markRead(n.id);
    if (n.kind === 'lecture' && n.ref_id) nav.push('lecture-player', { lectureId: n.ref_id });
    else if (n.kind === 'note' && n.ref_subject_id) nav.push('notes-subject', { subjectId: n.ref_subject_id });
    else if (n.kind === 'homework' && n.ref_subject_id) nav.push('homework-subject', { subjectId: n.ref_subject_id });
    else if (n.kind === 'quiz') nav.reset('quizzes');
    else if (n.kind === 'ai') nav.reset('notebooklm');
    else if (n.kind === 'result') nav.reset('student-marks');
  };

  return (
    <Page onRefresh={refresh} refreshing={loading && items.length > 0}>
      <Head title="Notifications" sub={unread ? `${unread} unread` : 'You are all caught up.'}
        right={unread ? <Btn small kind="soft" icon="check-double" label="Mark all read" onPress={markAllRead} /> : null} />
      {loading && !items.length ? <Loading /> : !items.length ? (
        <Empty icon="bell" title="No notifications yet" text="When a lecture, note, homework or quiz is uploaded for your class, it will appear here." />
      ) : items.map((n) => {
        const [icon, tint] = KIND[n.kind] || KIND.general;
        return (
          <Card key={n.id} onPress={() => open(n)} style={[st.row, !n.read && { borderColor: C.primary, borderWidth: 1.5 }]}>
            <View style={[st.ic, { backgroundColor: tint }]}><Icon name={icon} size={15} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[st.t, !n.read && { fontFamily: F.b }]}>{n.title}</Text>
              {!!n.body && <Text style={st.b} numberOfLines={2}>{n.body}</Text>}
              <Text style={st.time}>{timeAgo(n.created_at)}</Text>
            </View>
            {!n.read && <View style={st.dot} />}
          </Card>
        );
      })}
    </Page>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ic: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  t: { fontFamily: F.s, fontSize: 13.5, color: C.primary },
  b: { fontFamily: F.r, fontSize: 12, color: C.grey, marginTop: 1 },
  time: { fontFamily: F.m, fontSize: 10.5, color: C.grey, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.alert },
});
