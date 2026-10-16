import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Async, Icon, ListItem, Page, SectionTitle, Tile } from '../../components/ui';
import HomeHeader from '../../components/HomeHeader';
import { useApp } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { useAsync } from '../../lib/helpers';
import { C, F, R } from '../../theme';

/** Shared by the admin and teacher roles (teachers only see their assigned classes). */
export function StaffDashboard({ nav }) {
  const { isAdmin, classes, profile } = useApp();
  const scope = classes.length ? classes : [0];

  const q = useAsync(async () => {
    const c = (t, f) => { const r = sb.from(t).select('id', { count: 'exact', head: true }).in('class_no', scope); return f ? f(r) : r; };
    const jobs = {
      students: c('student_profiles'), lectures: c('lectures'), notes: c('notes'), hw: c('homework'),
      quizzes: c('quizzes', (r) => r.eq('is_active', true)),
      attempts: sb.from('quiz_attempts').select('id', { count: 'exact', head: true }),
      teachers: isAdmin ? sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher') : Promise.resolve(null),
    };
    const keys = Object.keys(jobs);
    const res = await Promise.allSettled(keys.map((k) => jobs[k]));
    const out = {};
    keys.forEach((k, i) => { out[k] = res[i].status === 'fulfilled' ? res[i].value?.count ?? 0 : 0; });
    return out;
  }, [scope.join(',')]);

  const tools = [
    ['users', 'Students', isAdmin ? 'Create accounts and view student information' : 'Review students in your assigned classes', 'students'],
    ['cloud-arrow-up', 'Content', 'Upload notes, homework and lectures', 'content'],
    ['list-check', 'Quiz Manager', 'Create and manage quizzes', 'quiz-manager'],
    ['comments', 'Discussions', 'Reply to student doubts on lectures', 'lecture-discussions'],
    ['chart-column', 'Marks', 'Enter exam marks and declare results', 'marks'],
    ['ranking-star', 'Leaderboard', 'Class quiz rankings and monitoring', 'leaderboard'],
    ...(isAdmin ? [['chalkboard-user', 'Teachers', 'Create teacher accounts and manage access', 'teachers']] : []),
  ];

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <HomeHeader />
      <View style={st.banner}>
        <View style={{ flex: 1 }}>
          <Text style={st.bt}>{isAdmin ? 'Administration dashboard' : `Welcome, ${(profile?.full_name || 'Teacher').split(' ')[0]}`}</Text>
          <Text style={st.bs}>
            {isAdmin ? 'Manage BCC students, teachers, class content, quizzes and marks.'
              : classes.length ? `Your teaching workspace for ${classes.map((n) => `Class ${n}`).join(' & ')}.` : 'No classes are assigned to your account yet. Contact the BCC administrator.'}
          </Text>
        </View>
        <Icon name="chalkboard-user" size={34} color={C.accent} />
      </View>

      <Async q={q}>
        {(d) => (
          <>
            <Text style={st.h2}>Overview</Text>
            <View style={st.grid}>
              <Tile icon="users" tone="lav" title="Students" value={d.students} sub="In your classes" onPress={() => nav.reset('students')} />
              <Tile icon="video" tone="sun" title="Lectures" value={d.lectures} sub="Uploaded / linked" onPress={() => nav.reset('content')} />
              <Tile icon="note-sticky" tone="mint" title="Notes" value={d.notes} sub="Study files" onPress={() => nav.reset('content')} />
              <Tile icon="book-open" tone="blush" title="Homework" value={d.hw} sub="Assignments" onPress={() => nav.reset('content')} />
              <Tile icon="circle-question" tone="lav" title="Active quizzes" value={d.quizzes} sub="Currently active" onPress={() => nav.reset('quiz-manager')} />
              <Tile icon="check-double" tone="sun" title="Quiz attempts" value={d.attempts} sub="Submitted" onPress={() => nav.reset('leaderboard')} />
              {isAdmin && <Tile icon="chalkboard-user" tone="mint" title="Teachers" value={d.teachers} sub="Active & inactive" onPress={() => nav.reset('teachers')} />}
              <Tile icon="graduation-cap" tone="blush" title="Classes" value={classes.length ? classes.join(' & ') : '—'} sub="Access" />
            </View>
          </>
        )}
      </Async>

      <SectionTitle>{isAdmin ? 'Administration' : 'Teaching tools'}</SectionTitle>
      {tools.map(([ic, t, s, to]) => (
        <ListItem key={to} title={t} sub={s} left={<View style={st.ic}><Icon name={ic} size={15} color={C.accent} /></View>} right={<Icon name="chevron-right" size={11} color={C.grey} />} onPress={() => nav.reset(to)} />
      ))}
    </Page>
  );
}

const st = StyleSheet.create({
  banner: { backgroundColor: C.primary, borderRadius: R.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  bt: { fontFamily: F.b, fontSize: 18, color: C.white },
  bs: { fontFamily: F.r, fontSize: 12, color: C.soft, marginTop: 4, lineHeight: 18 },
  h2: { fontFamily: F.b, fontSize: 17, color: C.primary, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
