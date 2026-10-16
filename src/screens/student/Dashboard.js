import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Async, Bar, Card, Icon, ListItem, Page, SectionTitle, Tile } from '../../components/ui';
import HomeHeader from '../../components/HomeHeader';
import { useApp } from '../../lib/app';
import { useNotif } from '../../lib/notifications';
import { sb } from '../../lib/supabase';
import { fetchAcademicExamLeaderboard, num, timeAgo, useAsync } from '../../lib/helpers';
import { C, F, R } from '../../theme';

async function latestExamResult(classNo, uid) {
  const { data } = await sb.from('academic_exam_sets').select('id,exam_name').eq('class_no', classNo).eq('result_declared', true).order('created_at', { ascending: false }).limit(1);
  if (!data?.length) return null;
  const rows = await fetchAcademicExamLeaderboard(data[0].id);
  return { name: data[0].exam_name, me: rows.find((r) => r.student_id === uid) || null, total: rows.length };
}

export default function Dashboard({ nav }) {
  const { profile, classNo } = useApp();
  const { unread } = useNotif();

  const q = useAsync(async () => {
    const cnt = (t, f) => { const r = sb.from(t).select('id', { count: 'exact', head: true }).eq('class_no', classNo); return f ? f(r) : r; };
    const recent = (t, extra = '') => sb.from(t).select(`id,title,created_at,subject_id${extra},subjects(name)`).eq('class_no', classNo).order('created_at', { ascending: false }).limit(3);
    const jobs = {
      lec: cnt('lectures'), notes: cnt('notes'), hw: cnt('homework'), ai: cnt('notebooklm_resources', (r) => r.eq('is_active', true)),
      rLec: recent('lectures', ',is_live'), rNotes: recent('notes'), rHw: recent('homework'),
      quizzes: sb.from('quizzes').select('id,title,quiz_type,duration_minutes,total_marks').eq('class_no', classNo).eq('is_active', true).order('start_at', { ascending: false }),
      attempts: sb.from('quiz_attempts').select('quiz_id').eq('student_id', profile.id),
      board: sb.rpc('get_class_leaderboard', { p_class_no: classNo }),
      exam: latestExamResult(classNo, profile.id),
    };
    const keys = Object.keys(jobs);
    const res = await Promise.allSettled(keys.map((k) => jobs[k]));
    const get = (k) => { const r = res[keys.indexOf(k)]; return r.status === 'fulfilled' ? r.value : null; };
    const rows = (k) => get(k)?.data || [];

    const done = new Set(rows('attempts').map((a) => a.quiz_id));
    const quizzes = rows('quizzes');
    const pending = quizzes.filter((x) => !done.has(x.id));
    const board = rows('board');
    const me = board.find((r) => r.student_id === profile.id) || null;

    const updates = [
      ...rows('rLec').map((x) => ({ ...x, kind: 'lecture' })),
      ...rows('rNotes').map((x) => ({ ...x, kind: 'note' })),
      ...rows('rHw').map((x) => ({ ...x, kind: 'homework' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

    return {
      lec: get('lec')?.count ?? 0, notes: get('notes')?.count ?? 0, hw: get('hw')?.count ?? 0, ai: get('ai')?.count ?? 0,
      latestLec: rows('rLec')[0] || null, quizzes, pending, me, boardSize: board.length, exam: get('exam'), updates,
    };
  }, [classNo]);

  const open = (u) => {
    if (u.kind === 'lecture') nav.push('lecture-player', { lectureId: u.id });
    else if (u.kind === 'note') nav.push('notes-subject', { subjectId: u.subject_id });
    else nav.push('homework-subject', { subjectId: u.subject_id });
  };
  const ICON = { lecture: 'video', note: 'note-sticky', homework: 'book-open' };

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <HomeHeader />

      <Async q={q}>
        {(d) => {
          const nextQuiz = d.pending[0];
          const attempted = d.quizzes.length - d.pending.length;
          const examPct = d.exam?.me ? Number(d.exam.me.percentage) : null;
          return (
            <>
              <Text style={st.h2}>Continue learning</Text>
              <Pressable style={[st.big, { backgroundColor: C.lav }]} onPress={() => (d.latestLec ? nav.push('lecture-player', { lectureId: d.latestLec.id }) : nav.reset('lectures'))}>
                <View style={{ flex: 1 }}>
                  <Text style={st.bigTitle} numberOfLines={2}>{d.latestLec ? d.latestLec.title : 'No lectures yet'}</Text>
                  <Text style={st.bigSub}>{d.latestLec ? `${d.latestLec.subjects?.name || 'Lecture'}${d.latestLec.is_live ? ' • LIVE' : ''}` : 'New lectures will appear here'}</Text>
                  <Text style={st.bigLabel}>{d.latestLec ? 'Latest lecture' : 'Lectures'}  •  {d.lec} total</Text>
                </View>
                <View style={st.go}><Icon name="play" size={14} color={C.accent} /></View>
              </Pressable>

              <Pressable style={[st.big, { backgroundColor: C.sun }]} onPress={() => nav.reset('quizzes')}>
                <View style={{ flex: 1 }}>
                  <Text style={st.bigTitle} numberOfLines={2}>{nextQuiz ? nextQuiz.title : d.quizzes.length ? 'All quizzes attempted' : 'No active quiz'}</Text>
                  <Text style={st.bigSub}>{nextQuiz ? `${nextQuiz.quiz_type} • ${nextQuiz.duration_minutes} min • ${nextQuiz.total_marks} marks` : 'You are all caught up'}</Text>
                  <Bar value={d.quizzes.length ? (attempted / d.quizzes.length) * 100 : 0} style={{ marginTop: 10, backgroundColor: 'rgba(27,20,100,0.15)' }} />
                  <Text style={st.bigLabel}>{attempted} of {d.quizzes.length} quizzes attempted</Text>
                </View>
                <View style={st.go}><Icon name={nextQuiz ? 'arrow-right' : 'check'} size={14} color={C.accent} /></View>
              </Pressable>

              <Text style={st.h2}>Your overview</Text>
              <View style={st.grid}>
                <Tile icon="video" tone="lav" title="Lectures" value={d.lec} sub={d.latestLec ? `Latest: ${d.latestLec.title}` : 'Nothing uploaded yet'} onPress={() => nav.reset('lectures')} />
                <Tile icon="note-sticky" tone="sun" title="Notes" value={d.notes} sub="Study files for your class" onPress={() => nav.reset('notes')} />
                <Tile icon="book-open" tone="mint" title="Homework" value={d.hw} sub="Assignments & instructions" onPress={() => nav.reset('homework')} />
                <Tile icon="circle-question" tone="blush" title="Quizzes" value={d.pending.length} sub={d.pending.length ? 'Waiting for you' : 'All attempted'} progress={d.quizzes.length ? (attempted / d.quizzes.length) * 100 : 0} onPress={() => nav.reset('quizzes')} />
                <Tile icon="file-signature" tone="lav" title="Marks" value={examPct != null ? `${num(examPct, 1)}%` : '—'} sub={d.exam ? d.exam.name : 'No result declared yet'} progress={examPct} onPress={() => nav.reset('student-marks')} />
                <Tile icon="ranking-star" tone="sun" title="Class rank" value={d.me ? `${d.me.rank}/${d.boardSize}` : '—'} sub={d.me ? `${num(d.me.percentage, 1)}% overall in quizzes` : 'Attempt a quiz to get ranked'} onPress={() => nav.reset('leaderboard')} />
                <Tile icon="wand-magic-sparkles" tone="mint" title="AI Study Hub" value={d.ai} sub="NotebookLM & Gemini links" onPress={() => nav.reset('notebooklm')} />
                <Tile icon="bell" tone="blush" title="Notifications" value={unread} sub={unread ? 'New updates for you' : 'No new updates'} onPress={() => nav.push('notifications')} />
              </View>

              <SectionTitle>Recent updates</SectionTitle>
              {d.updates.length ? d.updates.map((u) => (
                <ListItem key={`${u.kind}${u.id}`} title={u.title} sub={`${u.subjects?.name || ''} • ${timeAgo(u.created_at)}`}
                  left={<View style={st.ic}><Icon name={ICON[u.kind]} size={14} color={C.accent} /></View>} right={<Icon name="chevron-right" size={11} color={C.grey} />} onPress={() => open(u)} />
              )) : <Card><Text style={st.muted}>New lectures, notes and homework will show here.</Text></Card>}
              <Text style={st.copy}>© 2009 Brilliant Coaching Centre. All Rights Reserved.</Text>
            </>
          );
        }}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  h2: { fontFamily: F.b, fontSize: 17, color: C.primary, marginBottom: 12, marginTop: 4 },
  big: { borderRadius: R.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  bigTitle: { fontFamily: F.b, fontSize: 17, color: C.primary, lineHeight: 23 },
  bigSub: { fontFamily: F.r, fontSize: 12, color: C.grey, marginTop: 3 },
  bigLabel: { fontFamily: F.s, fontSize: 11, color: C.primary, marginTop: 8 },
  go: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  ic: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  muted: { fontFamily: F.r, fontSize: 12.5, color: C.grey },
  copy: { fontFamily: F.r, fontSize: 10.5, color: C.grey, textAlign: 'center', marginTop: 10 },
});
