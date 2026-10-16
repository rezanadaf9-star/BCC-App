import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Async, Card, Empty, Head, Icon, ListItem, Page, Pill, Row, Label } from '../../components/ui';
import Discussion from '../../components/Discussion';
import { useApp } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { fmtDateTime, isMissingTable, useAsync } from '../../lib/helpers';
import { C, F } from '../../theme';

/** Teachers/admin: lectures of their classes with comment counts and unanswered student doubts. */
export function LectureDiscussions({ nav }) {
  const { classes } = useApp();
  const q = useAsync(async () => {
    const { data: lec, error } = await sb.from('lectures').select('id,title,class_no,created_at,subjects(name)').in('class_no', classes.length ? classes : [0]).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    const ids = (lec || []).map((x) => x.id);
    let rows = []; let missing = false; let flat = false;
    if (ids.length) {
      let r = await sb.from('lecture_comments').select('id,lecture_id,parent_id,author_role').in('lecture_id', ids).limit(3000);
      if (r.error && /parent_id/i.test(r.error.message || '')) { flat = true; r = await sb.from('lecture_comments').select('id,lecture_id,author_role').in('lecture_id', ids).limit(3000); }
      if (r.error) { if (isMissingTable(r.error)) missing = true; else throw r.error; } else rows = r.data || [];
    }
    const items = (lec || []).map((l) => {
      const cs = rows.filter((c) => c.lecture_id === l.id);
      const tops = cs.filter((c) => !c.parent_id && c.author_role === 'student');
      const unanswered = flat ? 0 : tops.filter((t) => !cs.some((c) => c.parent_id === t.id && c.author_role !== 'student')).length;
      return { ...l, total: cs.length, unanswered };
    }).sort((a, b) => (b.unanswered - a.unanswered) || (new Date(b.created_at) - new Date(a.created_at)));
    return { items, missing };
  }, [classes.join(',')]);

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Discussions" sub="Student doubts and comments on lectures. Open a lecture to reply." />
      <Async q={q}>
        {({ items, missing }) => missing ? (
          <Empty icon="comments" title="Comments are not enabled yet" text="Run supabase/APP_FEATURES.sql in the Supabase SQL Editor." />
        ) : items.length ? items.map((l) => (
          <ListItem key={l.id} title={l.title} sub={`Class ${l.class_no} • ${l.subjects?.name || 'Subject'} • ${l.total} comment${l.total === 1 ? '' : 's'}`}
            left={<View style={st.ic}><Icon name="comments" size={15} color={C.accent} /></View>}
            right={l.unanswered > 0 ? <Pill danger text={`${l.unanswered} new`} /> : <Icon name="chevron-right" size={11} color={C.grey} />}
            onPress={() => nav.push('lecture-discussion', { lectureId: l.id })} />
        )) : <Empty icon="video" title="No lectures yet" text="Lectures of your classes will appear here." />}
      </Async>
    </Page>
  );
}

export function LectureDiscussion({ params }) {
  const q = useAsync(async () => {
    const { data, error } = await sb.from('lectures').select('id,title,class_no,created_at,description,subjects(name)').eq('id', params.lectureId).single();
    if (error) throw error;
    return data;
  }, [params.lectureId]);
  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {(x) => (
          <>
            <Card>
              <Text style={st.t}>{x.title}</Text>
              <Row style={{ marginVertical: 8 }}><Pill text={`Class ${x.class_no}`} /><Pill text={x.subjects?.name || 'Subject'} /></Row>
              <Label>{fmtDateTime(x.created_at)}</Label>
              {!!x.description && <Text style={st.d}>{x.description}</Text>}
            </Card>
            <Discussion lectureId={x.id} moderator />
          </>
        )}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  t: { fontFamily: F.b, fontSize: 15.5, color: C.primary },
  d: { fontFamily: F.r, fontSize: 12.5, color: C.grey, marginTop: 6, lineHeight: 19 },
});
