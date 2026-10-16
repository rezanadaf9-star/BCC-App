import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Async, Card, Empty, Head, Icon, ListItem, Page, Pill, Podium, RankList, Sheet, Btn, Label, Stat } from '../../components/ui';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import {
  academicTotals, addPhotoUrls, classText, fetchAcademicExamLeaderboard, fetchLatestClassQuiz, fmtDate, num, rankLabel, useAsync,
} from '../../lib/helpers';
import { C, F, R } from '../../theme';

const EXAM_SEL = 'id,class_no,exam_name,created_at,result_declared,academic_exam_subjects(subject_id,subject_name,full_marks)';

/* ----------------------------- Academic marks (school exams) ----------------------------- */
export function StudentMarks({ nav }) {
  const { classNo, profile } = useApp();
  const { toast } = useUi();
  const [detail, setDetail] = useState(null);
  const q = useAsync(async () => {
    const { data, error } = await sb.from('academic_exam_sets').select(EXAM_SEL).eq('class_no', classNo).order('created_at', { ascending: false });
    if (error) throw error;
    const exams = data || [];
    const declared = exams.filter((e) => e.result_declared);
    const latest = declared[0] || null;
    let rows = [];
    if (latest) rows = await fetchAcademicExamLeaderboard(latest.id);
    return { exams, declared, latest, rows, me: rows.find((r) => r.student_id === profile.id) || null };
  }, [classNo]);

  const openDetail = async (exam) => {
    try {
      const { data: record, error } = await sb.from('student_exam_marks').select('marks,status,updated_at,included_subject_ids').eq('exam_id', exam.id).eq('student_id', profile.id).maybeSingle();
      if (error) throw error;
      if (!record || record.status !== 'completed') return toast('Your marks for this exam are not published yet.', 'error');
      if (!exam.result_declared) return toast('This exam result has not been declared yet.', 'error');
      const ranked = await fetchAcademicExamLeaderboard(exam.id);
      const mine = ranked.find((r) => r.student_id === profile.id);
      setDetail({ exam, record, rank: mine?.rank || 0, totals: academicTotals(exam, record) });
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Marks" sub={`${classText(classNo)} academic marks and examination performance.`} />
      <Async q={q}>
        {({ exams, declared, latest, rows, me }) => (
          <>
            <Card>
              <Pill active text="LATEST EXAM LEADERBOARD" />
              <Text style={st.h2}>{latest ? latest.exam_name : 'No declared exam yet'}</Text>
              {latest ? (
                <>
                  <Podium rows={rows} currentId={profile.id} academic />
                  {me && (
                    <View style={st.rankBox}>
                      <Icon name="ranking-star" size={16} color={C.accent} />
                      <View style={{ flex: 1 }}><Text style={st.rankLbl}>Your rank in {latest.exam_name}</Text><Text style={st.rankSub}>{num(me.percentage)}% overall</Text></View>
                      <Text style={st.rankVal}>{rankLabel(me.rank)}</Text>
                    </View>
                  )}
                </>
              ) : <Empty icon="ranking-star" title="No declared exam result yet" text="Your class podium appears here after your teacher declares a result." />}
            </Card>

            <Text style={st.sec}>Your exam records</Text>
            {exams.length ? exams.map((e) => (
              <ListItem key={e.id} title={e.exam_name}
                sub={`${(e.academic_exam_subjects || []).length} subjects • ${e.result_declared ? 'Result declared' : 'Result not declared'} • ${fmtDate(e.created_at)}`}
                left={<View style={st.ic}><Icon name="file-lines" size={15} color={C.accent} /></View>}
                right={<Icon name="chevron-right" size={12} color={C.grey} />} onPress={() => openDetail(e)} />
            )) : <Empty icon="file-lines" title="No exam added yet" text="Exam cards appear when your teacher creates them." />}

            <Text style={st.sec}>Declared exam leaderboards</Text>
            {declared.length ? declared.map((e) => (
              <ListItem key={e.id} title={`${e.exam_name} Leaderboard`} sub={`Result declared • ${fmtDate(e.created_at)}`}
                left={<View style={[st.ic, { backgroundColor: C.accent }]}><Icon name="ranking-star" size={15} /></View>}
                right={<Icon name="chevron-right" size={12} color={C.grey} />} onPress={() => nav.push('student-academic-leaderboard', { examId: e.id })} />
            )) : <Text style={st.muted}>No declared exam results yet.</Text>}

            <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.exam.exam_name || ''}
              footer={<Btn small label="Done" onPress={() => setDetail(null)} />}>
              {detail && (
                <>
                  <Label style={{ marginBottom: 10 }}>{classText(classNo)} • Detailed marks</Label>
                  <View style={st.sumGrid}>
                    <Stat icon="star" label="Total marks" value={`${detail.totals.total} / ${detail.totals.full}`} />
                    <Stat icon="percent" label="Percentage" value={`${detail.totals.full ? num((detail.totals.total / detail.totals.full) * 100) : '0.00'}%`} />
                  </View>
                  <View style={st.sumGrid}>
                    <Stat icon="trophy" label="Class rank" value={detail.rank > 0 ? rankLabel(detail.rank) : '—'} />
                    <Stat icon="book" label="Subjects" value={String(detail.totals.subjects.length)} />
                  </View>
                  {detail.totals.subjects.map((s) => {
                    const m = Number(detail.record.marks?.[s.subject_id] || 0); const fm = Number(s.full_marks || 0);
                    return (
                      <View key={s.subject_id} style={st.subRow}>
                        <Text style={st.subName}>{s.subject_name}</Text>
                        <Text style={st.subMarks}>{m} / {fm}</Text>
                        <Text style={st.subPct}>{fm ? num((m / fm) * 100) : '0.00'}%</Text>
                      </View>
                    );
                  })}
                </>
              )}
            </Sheet>
          </>
        )}
      </Async>
    </Page>
  );
}

export function StudentAcademicLeaderboard({ params, nav }) {
  const { classNo, profile } = useApp();
  const q = useAsync(async () => {
    const { data: exam, error } = await sb.from('academic_exam_sets').select(EXAM_SEL).eq('id', params.examId).eq('class_no', classNo).single();
    if (error) throw error;
    if (!exam.result_declared) throw new Error('This result has not been declared yet.');
    return { exam, rows: await fetchAcademicExamLeaderboard(params.examId) };
  }, [params.examId]);
  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {({ exam, rows }) => {
          const me = rows.find((r) => r.student_id === profile.id);
          return (
            <>
              <Head title={`${exam.exam_name}`} sub={`${classText(classNo)} • ${rows.length} completed result${rows.length === 1 ? '' : 's'}`} />
              <Card><Podium rows={rows} currentId={profile.id} academic /></Card>
              {me && (
                <View style={st.rankBox}>
                  <Icon name="ranking-star" size={16} color={C.accent} />
                  <View style={{ flex: 1 }}><Text style={st.rankLbl}>Your rank</Text><Text style={st.rankSub}>{num(me.percentage)}% • {me.total_score} / {me.total_full_marks}</Text></View>
                  <Text style={st.rankVal}>{rankLabel(me.rank)}</Text>
                </View>
              )}
              <RankList rows={rows} currentId={profile.id} academic />
            </>
          );
        }}
      </Async>
    </Page>
  );
}

/* ----------------------------- Quiz leaderboard ----------------------------- */
export function StudentLeaderboard() {
  const { classNo, profile } = useApp();
  const q = useAsync(async () => {
    const [cum, hist, latestQuiz, size] = await Promise.all([
      sb.rpc('get_class_leaderboard', { p_class_no: classNo }),
      sb.rpc('get_my_quiz_history'),
      fetchLatestClassQuiz(classNo),
      sb.from('student_profiles').select('user_id', { count: 'exact', head: true }).eq('class_no', classNo),
    ]);
    if (cum.error) throw cum.error;
    if (hist.error) throw hist.error;
    let latestRows = [];
    if (latestQuiz) {
      const r = await sb.rpc('get_quiz_leaderboard', { p_quiz_id: latestQuiz.id });
      if (r.error) throw r.error;
      latestRows = await addPhotoUrls(r.data || []);
    }
    const cumRows = await addPhotoUrls(cum.data || []);
    return { cumRows, hist: hist.data || [], latestQuiz, latestRows, size: size.count ?? cumRows.length };
  }, [classNo]);

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Leaderboard" sub={`${classText(classNo)} rankings, latest quiz performance and your history.`} />
      <Async q={q}>
        {({ cumRows, hist, latestQuiz, latestRows, size }) => {
          const me = cumRows.find((x) => x.student_id === profile.id);
          const latestMe = latestRows.find((x) => x.student_id === profile.id);
          return (
            <>
              <View style={st.sumGrid}>
                <Stat icon="ranking-star" label="Your class rank" value={me ? rankLabel(me.rank) : '—'} sub={me ? `${num(me.percentage)}% overall` : 'No attempts yet'} />
                <Stat icon="medal" label="Total marks" value={me ? `${me.total_score}/${me.total_marks}` : '0/0'} sub={me ? `${me.attempted_quizzes} attempted` : ''} />
              </View>
              <Card>
                <Pill active text="LATEST QUIZ" />
                <Text style={st.h2}>{latestQuiz?.title || 'No quiz yet'}</Text>
                <Label>{latestQuiz ? `${latestQuiz.quiz_type} • ${latestQuiz.total_marks} marks • ${fmtDate(latestQuiz.created_at)}` : 'A published quiz leaderboard will appear here.'}</Label>
                {latestQuiz && latestRows.length ? (
                  <>
                    <View style={st.rankBox}>
                      <Icon name="chart-line" size={16} color={C.accent} />
                      <View style={{ flex: 1 }}><Text style={st.rankLbl}>Your latest quiz position</Text><Text style={st.rankSub}>{latestMe ? `${latestMe.score}/${latestMe.total_marks} marks` : 'You have not attempted this quiz.'}</Text></View>
                      <Text style={st.rankVal}>{latestMe ? rankLabel(latestMe.rank) : '—'}</Text>
                    </View>
                    <Podium rows={latestRows} currentId={profile.id} />
                    <RankList rows={latestRows} currentId={profile.id} />
                  </>
                ) : <Empty icon="ranking-star" title="No leaderboard yet" text="The latest quiz has no submitted attempts yet." />}
              </Card>
              <Card>
                <Pill text="CUMULATIVE" />
                <Text style={st.h2}>{classText(classNo)} overall ranking</Text>
                <Label>Cumulative percentage across all submitted quizzes • {size} students</Label>
                {cumRows.length ? <><Podium rows={cumRows} currentId={profile.id} /><RankList rows={cumRows} currentId={profile.id} /></> : <Empty icon="ranking-star" title="No overall ranking yet" />}
              </Card>
              <Card>
                <Pill text="HISTORY" />
                <Text style={st.h2}>Your quiz history</Text>
                {hist.length ? hist.map((r, i) => (
                  <View key={i} style={st.subRow}>
                    <View style={{ flex: 1 }}><Text style={st.subName}>{r.quiz_title}</Text><Text style={st.muted}>{r.quiz_type} • {fmtDate(r.submitted_at)}</Text></View>
                    <Text style={st.subMarks}>{r.score}/{r.total_marks}</Text>
                    <Text style={st.subPct}>{rankLabel(r.rank)}</Text>
                  </View>
                )) : <Text style={st.muted}>No quiz history yet.</Text>}
              </Card>
            </>
          );
        }}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  h2: { fontFamily: F.b, fontSize: 17, color: C.primary, marginTop: 8, marginBottom: 2 },
  sec: { fontFamily: F.b, fontSize: 16, color: C.primary, marginTop: 8, marginBottom: 10 },
  muted: { fontFamily: F.r, fontSize: 12, color: C.grey },
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  rankBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.primary, borderRadius: R.md, padding: 14, marginVertical: 12 },
  rankLbl: { fontFamily: F.s, fontSize: 12.5, color: C.white },
  rankSub: { fontFamily: F.r, fontSize: 11, color: C.soft },
  rankVal: { fontFamily: F.b, fontSize: 22, color: C.accent },
  sumGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  subName: { flex: 1, fontFamily: F.s, fontSize: 13, color: C.primary },
  subMarks: { fontFamily: F.m, fontSize: 12.5, color: C.black },
  subPct: { minWidth: 56, textAlign: 'right', fontFamily: F.b, fontSize: 12.5, color: C.primary },
});
