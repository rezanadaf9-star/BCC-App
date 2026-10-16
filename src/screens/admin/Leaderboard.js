import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Async, Avatar, Card, Empty, Head, Icon, ListItem, Page, Pill, Podium, RankList, SectionTitle, Stat, Label } from '../../components/ui';
import { sb } from '../../lib/supabase';
import { useApp } from '../../lib/app';
import { addPhotoUrls, byRoll, fetchLatestClassQuiz, num, rankLabel, useAsync } from '../../lib/helpers';
import { C, F } from '../../theme';

export function AdminLeaderboard({ nav }) {
  const { classes } = useApp();
  return (
    <Page>
      <Head title="Leaderboard" sub="Cumulative ranking and quiz performance for each class." />
      {classes.map((c) => (
        <ListItem key={c} title={`Class ${c}`} sub={`View Class ${c} ranks, marks and quiz performance.`}
          left={<View style={st.ic}><Icon name="graduation-cap" size={15} color={C.accent} /></View>} right={<Icon name="arrow-right" size={13} />} onPress={() => nav.push('leaderboard-class', { classNo: c })} />
      ))}
    </Page>
  );
}

export function AdminLeaderboardClass({ params }) {
  const classNo = Number(params.classNo);
  const q = useAsync(async () => {
    const [cum, latestQuiz, stu, quizzes] = await Promise.all([
      sb.rpc('get_class_leaderboard', { p_class_no: classNo }),
      fetchLatestClassQuiz(classNo),
      sb.from('student_profiles').select('user_id,class_no,roll_number,phone,photo_path,profiles(full_name,login_id)').eq('class_no', classNo),
      sb.from('quizzes').select('id,title,total_marks,created_at').eq('class_no', classNo).order('created_at', { ascending: false }),
    ]);
    if (cum.error) throw cum.error; if (stu.error) throw stu.error; if (quizzes.error) throw quizzes.error;
    const cumRows = await addPhotoUrls(cum.data || []);
    let latestRows = [];
    if (latestQuiz) { const r = await sb.rpc('get_quiz_leaderboard', { p_quiz_id: latestQuiz.id }); if (r.error) throw r.error; latestRows = await addPhotoUrls(r.data || []); }
    const students = (await addPhotoUrls(stu.data || [])).sort(byRoll);
    const ids = (quizzes.data || []).map((x) => x.id);
    let attempts = [];
    if (ids.length) { const a = await sb.from('quiz_attempts').select('student_id,quiz_id,score,total_marks,submitted_at').in('quiz_id', ids).order('submitted_at', { ascending: false }); if (a.error) throw a.error; attempts = a.data || []; }
    const byStudent = new Map();
    for (const a of attempts) { if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []); const arr = byStudent.get(a.student_id); if (!arr.some((x) => x.quiz_id === a.quiz_id)) arr.push(a); }
    const cm = new Map(cumRows.map((r) => [r.student_id, r]));
    const pct = (a) => (a && Number(a.total_marks) > 0 ? (Number(a.score) / Number(a.total_marks)) * 100 : null);
    const monitor = students.map((s) => {
      const h = byStudent.get(s.user_id) || [];
      const l = pct(h[0]); const p = pct(h[1]);
      return { s, c: cm.get(s.user_id), latest: h[0], change: l != null && p != null ? l - p : null, count: h.length };
    });
    return { cumRows, latestQuiz, latestRows, monitor, count: students.length };
  }, [classNo]);

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title={`Class ${classNo} Leaderboard`} sub="Quiz performance, cumulative ranking and student monitoring." />
      <Async q={q}>
        {({ cumRows, latestQuiz, latestRows, monitor, count }) => (
          <>
            <View style={st.grid}>
              <Stat icon="users" label="Students" value={count} sub={`Class ${classNo}`} />
              <Stat icon="medal" label="Top percentage" value={cumRows[0] ? `${num(cumRows[0].percentage)}%` : '—'} sub="Current leader" />
            </View>
            <Card>
              <Pill active text="LATEST QUIZ" />
              <Text style={st.h2}>{latestQuiz?.title || 'No quiz yet'}</Text>
              {latestRows.length ? <><Podium rows={latestRows} admin /><RankList rows={latestRows} admin /></> : <Empty icon="ranking-star" title="No latest quiz attempts" text="No students have submitted the latest quiz yet." />}
            </Card>
            <Card>
              <Pill text="CUMULATIVE" />
              <Text style={st.h2}>All Class {classNo} students</Text>
              <Label style={{ marginBottom: 6 }}>Overall percentage across all submitted quizzes.</Label>
              {cumRows.length ? cumRows.map((r) => (
                <View key={r.student_id} style={st.row}>
                  <Text style={st.rank}>{rankLabel(r.rank)}</Text>
                  <Avatar uri={r.photo_url} name={r.full_name} size={34} />
                  <View style={{ flex: 1 }}><Text style={st.name} numberOfLines={1}>{r.full_name}</Text><Label>{r.login_id} • {r.attempted_quizzes} quizzes</Label></View>
                  <View style={{ alignItems: 'flex-end' }}><Text style={st.sc}>{r.total_score}/{r.total_marks}</Text><Text style={st.pc}>{num(r.percentage)}%</Text></View>
                </View>
              )) : <Label>No students found.</Label>}
            </Card>
            <Card>
              <Pill text="STUDENT MONITORING" />
              <Text style={st.h2}>Quiz performance by roll number</Text>
              {monitor.map(({ s, c, latest, change, count: n }) => (
                <View key={s.user_id} style={st.row}>
                  <Avatar uri={s.photo_url} name={s.profiles?.full_name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.name} numberOfLines={1}>{s.profiles?.full_name}</Text>
                    <Label>Roll {s.roll_number || '—'} • Overall {c ? num(c.percentage) : '0.00'}% • {n} quiz{n === 1 ? '' : 'zes'}</Label>
                    <Label>Latest: {latest ? `${latest.score}/${latest.total_marks}` : 'Not attempted'}</Label>
                  </View>
                  {change == null ? <Text style={st.neu}>—</Text> : (
                    <View style={st.trend}>
                      <Icon name={change > 0 ? 'arrow-up' : change < 0 ? 'arrow-down' : 'minus'} size={10} color={change > 0 ? C.success : change < 0 ? C.alert : C.grey} />
                      <Text style={[st.pc, { color: change > 0 ? C.success : change < 0 ? C.alert : C.grey }]}>{change > 0 ? '+' : ''}{change.toFixed(1)}%</Text>
                    </View>
                  )}
                </View>
              ))}
            </Card>
          </>
        )}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  h2: { fontFamily: F.b, fontSize: 16, color: C.primary, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  rank: { width: 34, fontFamily: F.b, fontSize: 12.5, color: C.primary },
  name: { fontFamily: F.s, fontSize: 13, color: C.primary },
  sc: { fontFamily: F.m, fontSize: 12.5, color: C.black },
  pc: { fontFamily: F.b, fontSize: 12, color: C.primary },
  neu: { fontFamily: F.b, color: C.grey },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
