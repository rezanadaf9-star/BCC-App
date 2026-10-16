import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Async, Avatar, Btn, Card, Empty, Field, Head, Icon, ListItem, Page, Pill, Podium, RankList, Row, Sheet, Label, SectionTitle, Stat } from '../../components/ui';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import {
  academicTotals, addPhotoUrls, byRoll, classText, fetchAcademicExamLeaderboard, fmtDate, includedAcademicSubjects, initials, num, rankLabel, subjectsForClass, useAsync,
} from '../../lib/helpers';
import { C, F, R } from '../../theme';
import { notify } from '../../lib/notifications';

const EX = 'id,class_no,exam_name,created_at,result_declared,academic_exam_subjects(subject_id,subject_name,full_marks)';

/* ----------------------------- Marks home ----------------------------- */
export function Marks({ nav }) {
  const { classes } = useApp();
  const q = useAsync(async () => {
    const [ex, st] = await Promise.all([
      sb.from('academic_exam_sets').select('id,class_no,exam_name,created_at,result_declared').order('created_at', { ascending: false }),
      sb.from('student_profiles').select('user_id,class_no'),
    ]);
    if (ex.error) throw ex.error; if (st.error) throw st.error;
    return { exams: ex.data || [], students: st.data || [] };
  }, []);
  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Marks" sub="School exam marks are entered here. Quiz performance is in Leaderboard." />
      <Async q={q}>
        {({ exams, students }) => (
          <>
            {classes.map((c) => {
              const list = exams.filter((e) => e.class_no === c);
              return (
                <ListItem key={c} title={`Class ${c}`} sub={`${students.filter((s) => Number(s.class_no) === c).length} students • ${list.length} exam${list.length === 1 ? '' : 's'} • ${list.filter((e) => e.result_declared).length} declared`}
                  left={<View style={st.ic}><Icon name="graduation-cap" size={15} color={C.accent} /></View>} right={<Icon name="arrow-right" size={13} />} onPress={() => nav.push('marks-class', { classNo: c })} />
              );
            })}
            <SectionTitle>Declared exam leaderboards</SectionTitle>
            {classes.map((c) => (
              <View key={c}>
                <Label style={{ marginBottom: 6 }}>Class {c}</Label>
                {exams.filter((e) => e.class_no === c && e.result_declared).map((e) => (
                  <ListItem key={e.id} title={e.exam_name} sub={`Result declared • ${fmtDate(e.created_at)}`} left={<View style={[st.ic, { backgroundColor: C.accent }]}><Icon name="ranking-star" size={15} /></View>}
                    right={<Icon name="arrow-right" size={13} />} onPress={() => nav.push('academic-leaderboard-exam', { classNo: c, examId: e.id })} />
                ))}
                {!exams.some((e) => e.class_no === c && e.result_declared) && <Text style={st.muted}>No declared exam results yet.</Text>}
              </View>
            ))}
          </>
        )}
      </Async>
    </Page>
  );
}

/* ----------------------------- Class marks page ----------------------------- */
export function MarksClass({ params, nav }) {
  const classNo = Number(params.classNo);
  const { profile } = useApp();
  const { toast, loading } = useUi();
  const [setup, setSetup] = useState(false);
  const [entry, setEntry] = useState(null); // {examId, studentId}
  const [overview, setOverview] = useState(null);
  const q = useAsync(async () => {
    const [st, ex] = await Promise.all([
      sb.from('student_profiles').select('user_id,class_no,roll_number,batch,phone,photo_path,profiles(full_name,login_id)').eq('class_no', classNo),
      sb.from('academic_exam_sets').select(EX).eq('class_no', classNo).order('created_at', { ascending: false }),
    ]);
    if (st.error) throw st.error; if (ex.error) throw ex.error;
    return { students: (st.data || []).sort(byRoll), exams: ex.data || [] };
  }, [classNo]);

  const declare = (examId) => Alert.alert('Declare result?', 'Students will be able to see this exam leaderboard after declaration.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Declare', onPress: async () => {
    loading(true, 'Declaring result...');
    try {
      const { data: rows, error } = await sb.from('student_exam_marks').select('student_id,status').eq('exam_id', examId);
      if (error) throw error;
      const pending = (rows || []).filter((r) => r.status !== 'completed').length;
      const total = q.data.students.length; const missing = total - (rows || []).length;
      const unfinished = pending + Math.max(0, missing);
      const go = async () => {
        const u = await sb.from('academic_exam_sets').update({ result_declared: true }).eq('id', examId).eq('class_no', classNo);
        if (u.error) return toast(u.error.message, 'error');
        const examName = q.data?.exams?.find((x) => x.id === examId)?.exam_name || 'Exam';
        await notify({ classNo, kind: 'result', title: `Result declared: ${examName}`, body: 'Open Marks to see your result and class rank.', refId: examId });
        toast('Result declared. Students can now see the leaderboard.', 'success'); q.reload();
      };
      if (unfinished > 0) Alert.alert('Unfinished marks', `${unfinished} student${unfinished === 1 ? '' : 's'} still have unfinished marks. Declare anyway?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Declare anyway', onPress: go }]);
      else await go();
    } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
  } }]);

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title={`Class ${classNo} Marks`} sub="Students are arranged by roll number." right={<Btn small icon="plus" label="New Exam" onPress={() => setSetup(true)} />} />
      <Async q={q}>
        {({ students, exams }) => (
          <>
            <SectionTitle>Exams</SectionTitle>
            {exams.length ? exams.map((e) => (
              <Card key={e.id}>
                <Text style={st.t}>{e.exam_name}</Text>
                <Label>{(e.academic_exam_subjects || []).length} subjects • {fmtDate(e.created_at)} • {e.result_declared ? 'Result declared' : 'Result not declared'}</Label>
                <Row style={{ marginTop: 10 }}>
                  <Btn small icon="pen" label="Enter marks" onPress={() => setEntry({ examId: e.id })} />
                  {e.result_declared ? <Pill active text="Declared ✓" /> : <Btn small kind="yellow" icon="bullhorn" label="Declare" onPress={() => declare(e.id)} />}
                  <Btn small kind="ghost" icon="ranking-star" label="Leaderboard" onPress={() => nav.push('academic-leaderboard-exam', { classNo, examId: e.id })} />
                </Row>
              </Card>
            )) : <Empty icon="file-lines" title={`No exam for Class ${classNo} yet`} text="Tap New Exam to create one." />}

            <SectionTitle>Students ({students.length})</SectionTitle>
            {students.map((s, i) => (
              <ListItem key={s.user_id} title={s.profiles?.full_name || 'Student'} sub={`Roll No. ${s.roll_number || '—'} • ${classText(classNo)}`}
                left={<Avatar name={s.profiles?.full_name} size={40} />} right={<Icon name="chevron-right" size={12} color={C.grey} />} onPress={() => setOverview(s.user_id)} />
            ))}

            <ExamSetup visible={setup} classNo={classNo} onClose={() => setSetup(false)} onCreated={(examId) => { setSetup(false); q.reload(); setEntry({ examId }); }} />
            <MarksEntry entry={entry} classNo={classNo} onClose={() => { setEntry(null); q.reload(); }} />
            <StudentOverview studentId={overview} classNo={classNo} onClose={() => setOverview(null)} />
          </>
        )}
      </Async>
    </Page>
  );
}

function ExamSetup({ visible, classNo, onClose, onCreated }) {
  const { profile } = useApp();
  const { toast, loading } = useUi();
  const [name, setName] = useState('');
  const [marks, setMarks] = useState({});
  const subs = useAsync(() => subjectsForClass(classNo), [classNo]);
  const create = async () => {
    if (!name.trim()) return toast('Enter the exam name.', 'error');
    const rows = (subs.data || []).filter((s) => String(marks[s.id] || '').trim() !== '').map((s) => ({ subject_id: s.id, subject_name: s.name, full_marks: Number(marks[s.id]) }));
    if (!rows.length) return toast('Enter full marks for at least one subject.', 'error');
    if (rows.some((r) => !Number.isFinite(r.full_marks) || r.full_marks <= 0)) return toast('Full marks must be greater than 0.', 'error');
    loading(true, 'Creating exam...');
    try {
      const { data: exam, error } = await sb.from('academic_exam_sets').insert({ class_no: classNo, exam_name: name.trim(), created_by: profile.id }).select().single();
      if (error) throw error;
      const e2 = await sb.from('academic_exam_subjects').insert(rows.map((r) => ({ ...r, exam_id: exam.id })));
      if (e2.error) throw e2.error;
      setName(''); setMarks({}); toast('Exam created. Start entering marks.', 'success'); onCreated(exam.id);
    } catch (e) { toast(e.message || 'Could not create exam.', 'error'); } finally { loading(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={`Set up Class ${classNo} exam`} footer={<><Btn small kind="ghost" label="Cancel" onPress={onClose} /><Btn small icon="check" label="Create & Start" onPress={create} /></>}>
      <Label style={{ marginBottom: 12 }}>Only subjects where you enter full marks are included in this exam. Leave a subject blank if it is not taught.</Label>
      <Field label="Exam name" value={name} onChangeText={setName} placeholder="e.g. First Terminal Examination" autoCapitalize="words" />
      {(subs.data || []).map((s) => (
        <Field key={s.id} label={`${s.name} — Full marks`} value={String(marks[s.id] ?? '')} onChangeText={(v) => setMarks((m) => ({ ...m, [s.id]: v }))} keyboardType="decimal-pad" placeholder="Leave blank if not taught" />
      ))}
    </Sheet>
  );
}

/* ----------------------------- Marks entry (student by student) ----------------------------- */
function MarksEntry({ entry, classNo, onClose }) {
  const { toast } = useUi();
  const [index, setIndex] = useState(null);
  const [vals, setVals] = useState({});
  const [fmOpen, setFmOpen] = useState(false);
  const [rev, setRev] = useState(0); // bump to reload current card
  const data = useAsync(async () => {
    if (!entry) return null;
    const [ex, st, rec] = await Promise.all([
      sb.from('academic_exam_sets').select(EX).eq('id', entry.examId).single(),
      sb.from('student_profiles').select('user_id,class_no,roll_number,profiles(full_name,login_id)').eq('class_no', classNo),
      sb.from('student_exam_marks').select('student_id,status,included_subject_ids').eq('exam_id', entry.examId),
    ]);
    if (ex.error) throw ex.error; if (st.error) throw st.error; if (rec.error) throw rec.error;
    const list = (st.data || []).sort(byRoll);
    const map = new Map((rec.data || []).map((r) => [r.student_id, r]));
    let i = entry.studentId ? list.findIndex((s) => s.user_id === entry.studentId) : list.findIndex((s) => map.get(s.user_id)?.status !== 'completed');
    if (i < 0) i = 0;
    setIndex(i);
    return { exam: ex.data, list, subjects: ex.data.academic_exam_subjects || [] };
  }, [entry?.examId]);

  const student = data.data && index != null ? data.data.list[index] : null;
  const card = useAsync(async () => {
    if (!student) return null;
    const { data: ex, error } = await sb.from('student_exam_marks').select('marks,status,included_subject_ids').eq('exam_id', entry.examId).eq('student_id', student.user_id).maybeSingle();
    if (error) throw error;
    const all = data.data.subjects.map((s) => String(s.subject_id));
    const ids = Array.isArray(ex?.included_subject_ids) && ex.included_subject_ids.length ? ex.included_subject_ids.map(String) : all;
    const saved = ex?.marks || {};
    setVals(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])));
    return { ids, status: ex?.status };
  }, [student?.user_id, rev]);

  const active = data.data && card.data ? data.data.subjects.filter((s) => card.data.ids.includes(String(s.subject_id))) : [];
  const total = active.reduce((n, s) => n + (Number(vals[s.subject_id]) || 0), 0);
  const full = active.reduce((n, s) => n + Number(s.full_marks || 0), 0);

  const persist = async (status) => {
    const marks = {};
    for (const s of active) {
      const raw = String(vals[s.subject_id] ?? '').trim();
      if (raw === '') throw new Error('Enter marks for every selected subject before saving.');
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > Number(s.full_marks)) throw new Error(`${s.subject_name}: marks must be between 0 and ${s.full_marks}.`);
      marks[s.subject_id] = v;
    }
    const { error } = await sb.from('student_exam_marks').upsert({ exam_id: entry.examId, student_id: student.user_id, marks, status, included_subject_ids: card.data.ids, updated_at: new Date().toISOString() }, { onConflict: 'exam_id,student_id' });
    if (error) throw error;
  };
  const go = (n) => { setIndex(n); };
  const save = async () => { try { await persist('draft'); toast('Progress saved. Continue later from the first unfinished student.', 'success'); onClose(); } catch (e) { toast(e.message, 'error'); } };
  const done = async () => {
    try {
      await persist('completed');
      if (index + 1 < data.data.list.length) { toast(`${student.profiles?.full_name} completed. Next student loaded.`, 'success'); go(index + 1); }
      else { toast(`All ${data.data.list.length} students processed.`, 'success'); onClose(); }
    } catch (e) { toast(e.message, 'error'); }
  };
  const saveFm = async (ids) => {
    try {
      const { data: ex, error } = await sb.from('student_exam_marks').select('marks,status').eq('exam_id', entry.examId).eq('student_id', student.user_id).maybeSingle();
      if (error) throw error;
      const marks = { ...(ex?.marks || {}) }; Object.keys(marks).forEach((k) => { if (!ids.includes(String(k))) delete marks[k]; });
      const u = await sb.from('student_exam_marks').upsert({ exam_id: entry.examId, student_id: student.user_id, marks, status: ex?.status || 'draft', included_subject_ids: ids, updated_at: new Date().toISOString() }, { onConflict: 'exam_id,student_id' });
      if (u.error) throw u.error;
      setFmOpen(false); toast('FM updated for this student.', 'success'); setRev((r) => r + 1);
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Sheet visible={!!entry} onClose={onClose} title={data.data ? data.data.exam.exam_name : 'Enter marks'}
      footer={student ? (<>
        <Btn small kind="ghost" icon="arrow-left" label="" disabled={index === 0} onPress={() => go(index - 1)} />
        <Btn small kind="soft" icon="sliders" label="FM" onPress={() => setFmOpen(true)} />
        <Btn small kind="ghost" icon="floppy-disk" label="Save" onPress={save} />
        <Btn small kind="yellow" icon="check" label="Done" onPress={done} />
      </>) : null}>
      <Async q={data}>
        {() => student ? (
          <>
            <View style={st.meta}>
              <Avatar name={student.profiles?.full_name} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={st.t}>{student.profiles?.full_name}</Text>
                <Label>Roll No. {student.roll_number || '—'} • Student {index + 1} of {data.data.list.length}</Label>
              </View>
              {card.data?.status === 'completed' ? <Pill active text="Completed" /> : <Pill text="Pending" />}
            </View>
            <Async q={card}>
              {() => (
                <>
                  {active.map((s) => (
                    <View key={s.subject_id} style={st.mRow}>
                      <Text style={st.mName}>{s.subject_name}</Text>
                      <TextInput style={st.mInput} keyboardType="decimal-pad" placeholder="0" value={String(vals[s.subject_id] ?? '')} onChangeText={(v) => setVals((p) => ({ ...p, [s.subject_id]: v }))} />
                      <Text style={st.mFull}>/ {s.full_marks}</Text>
                    </View>
                  ))}
                  <View style={st.totalBox}>
                    <Text style={st.totalT}>Total: {Number(total.toFixed(2))} / {full}</Text>
                    <Text style={st.totalP}>{full ? num((total / full) * 100) : '0.00'}%</Text>
                  </View>
                  <FmSheet visible={fmOpen} onClose={() => setFmOpen(false)} subjects={data.data.subjects} current={card.data.ids} onSave={saveFm} />
                </>
              )}
            </Async>
          </>
        ) : <Empty icon="users" title="No students found" />}
      </Async>
    </Sheet>
  );
}

function FmSheet({ visible, onClose, subjects, current, onSave }) {
  const [sel, setSel] = useState(new Set(current));
  React.useEffect(() => { if (visible) setSel(new Set(current)); }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Subjects for this student" compact footer={<><Btn small kind="ghost" label="Cancel" onPress={onClose} /><Btn small icon="sliders" label="Update FM" onPress={() => sel.size ? onSave([...sel]) : Alert.alert('Keep at least one subject for this student.')} /></>}>
      <Label style={{ marginBottom: 10 }}>Uncheck a subject only if this student is not taking it. Other students are unaffected.</Label>
      {subjects.map((s) => {
        const id = String(s.subject_id);
        return (
          <View key={id} style={st.fmRow}>
            <View style={{ flex: 1 }}><Text style={st.mName}>{s.subject_name}</Text><Label>Full marks: {s.full_marks}</Label></View>
            <Switch value={sel.has(id)} trackColor={{ true: C.primary, false: C.line }} thumbColor={sel.has(id) ? C.accent : C.white}
              onValueChange={(v) => setSel((p) => { const n = new Set(p); v ? n.add(id) : n.delete(id); return n; })} />
          </View>
        );
      })}
    </Sheet>
  );
}

/* ----------------------------- Student academic overview ----------------------------- */
function StudentOverview({ studentId, classNo, onClose }) {
  const q = useAsync(async () => {
    if (!studentId) return null;
    const [stu, ex] = await Promise.all([
      sb.from('student_profiles').select('user_id,class_no,roll_number,batch,phone,photo_path,profiles(full_name,login_id)').eq('user_id', studentId).eq('class_no', classNo).single(),
      sb.from('academic_exam_sets').select(EX).eq('class_no', classNo).order('created_at', { ascending: false }),
    ]);
    if (stu.error) throw stu.error; if (ex.error) throw ex.error;
    const exams = ex.data || [];
    const profile = (await addPhotoUrls([stu.data]))[0] || stu.data;
    let records = [];
    if (exams.length) { const r = await sb.from('student_exam_marks').select('exam_id,student_id,marks,status,included_subject_ids').in('exam_id', exams.map((e) => e.id)); if (r.error) throw r.error; records = r.data || []; }
    const stats = exams.map((exam) => {
      const mine = records.find((r) => r.exam_id === exam.id && r.student_id === studentId);
      const t = academicTotals(exam, mine);
      return { exam, rec: mine, t, completed: mine?.status === 'completed' && t.percentage != null };
    });
    const ranks = new Map();
    for (const x of stats.filter((s) => s.completed)) {
      const cls = records.filter((r) => r.exam_id === x.exam.id && r.status === 'completed').map((r) => ({ id: r.student_id, pct: academicTotals(x.exam, r).percentage || 0 })).sort((a, b) => b.pct - a.pct);
      const i = cls.findIndex((r) => r.id === studentId); ranks.set(x.exam.id, i >= 0 ? i + 1 : null);
    }
    return { profile, stats, ranks };
  }, [studentId]);
  return (
    <Sheet visible={!!studentId} onClose={onClose} title="Academic profile">
      <Async q={q}>
        {(d) => {
          if (!d) return null;
          const done = d.stats.filter((s) => s.completed);
          const avg = done.length ? done.reduce((n, x) => n + x.t.percentage, 0) / done.length : 0;
          const change = done.length > 1 ? done[0].t.percentage - done[1].t.percentage : null;
          return (
            <>
              <View style={st.meta}>
                <Avatar uri={d.profile.photo_url} name={d.profile.profiles?.full_name} size={56} ring />
                <View style={{ flex: 1 }}><Text style={st.t}>{d.profile.profiles?.full_name}</Text><Label>Roll {d.profile.roll_number || '—'} • Class {classNo} • Batch {d.profile.batch}</Label><Label>{d.profile.phone || 'No phone number'}</Label></View>
              </View>
              <View style={st.two}><Stat icon="percent" label="Average" value={`${num(avg)}%`} /><Stat icon="check-double" label="Exams completed" value={`${done.length} / ${d.stats.length}`} /></View>
              {change != null && <View style={[st.banner, { backgroundColor: change >= 0 ? C.soft : '#ffe5e5' }]}><Icon name={change >= 0 ? 'arrow-trend-up' : 'arrow-trend-down'} size={16} color={change >= 0 ? C.success : C.alert} /><Text style={st.bannerT}>{change > 0 ? 'Improved' : change < 0 ? 'Declined' : 'No change'} by {Math.abs(change).toFixed(2)} points vs previous exam</Text></View>}
              {d.stats.map((x) => (
                <Card key={x.exam.id}>
                  <Pill text={x.exam.exam_name} />
                  <Text style={[st.t, { marginTop: 6 }]}>{x.completed ? `${x.t.total} / ${x.t.full} • ${num(x.t.percentage)}%` : 'Not completed'}</Text>
                  <Label>{fmtDate(x.exam.created_at)} • Rank {x.completed ? rankLabel(d.ranks.get(x.exam.id)) : '—'}</Label>
                  {x.t.subjects.map((s) => { const m = Number(x.rec?.marks?.[s.subject_id] || 0); const fm = Number(s.full_marks || 0); return (
                    <View key={s.subject_id} style={st.sRow}><Text style={st.mName}>{s.subject_name}</Text><Text style={st.sV}>{x.completed ? m : '—'} / {fm}</Text><Text style={st.sP}>{x.completed && fm ? num((m / fm) * 100) + '%' : '—'}</Text></View>
                  ); })}
                </Card>
              ))}
              {!d.stats.length && <Empty icon="file-lines" title="No exams created for this class yet" />}
            </>
          );
        }}
      </Async>
    </Sheet>
  );
}

/* ----------------------------- Declared exam leaderboard (admin) ----------------------------- */
export function AcademicLeaderboardExam({ params }) {
  const classNo = Number(params.classNo);
  const q = useAsync(async () => {
    const { data: exam, error } = await sb.from('academic_exam_sets').select(EX).eq('id', params.examId).eq('class_no', classNo).single();
    if (error) throw error;
    if (!exam.result_declared) throw new Error('This result has not been declared yet.');
    return { exam, rows: await fetchAcademicExamLeaderboard(params.examId) };
  }, [params.examId]);
  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {({ exam, rows }) => (
          <>
            <Head title={exam.exam_name} sub={`Class ${classNo} • ${rows.length} result${rows.length === 1 ? '' : 's'} • ${fmtDate(exam.created_at)}`} />
            <Card><Podium rows={rows} academic admin /></Card>
            <RankList rows={rows} academic admin />
          </>
        )}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  ic: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  t: { fontFamily: F.b, fontSize: 15, color: C.primary },
  muted: { fontFamily: F.r, fontSize: 12, color: C.grey, marginBottom: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.soft, borderRadius: 14, padding: 12, marginBottom: 14 },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  mName: { flex: 1, fontFamily: F.s, fontSize: 13.5, color: C.primary },
  mInput: { width: 84, borderWidth: 1.5, borderColor: C.line, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, fontFamily: F.s, fontSize: 15, textAlign: 'center', color: C.black },
  mFull: { width: 56, fontFamily: F.m, fontSize: 12.5, color: C.grey },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.primary, borderRadius: 14, padding: 14, marginTop: 6 },
  totalT: { fontFamily: F.b, fontSize: 15, color: C.white }, totalP: { fontFamily: F.b, fontSize: 15, color: C.accent },
  fmRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  two: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 12 },
  bannerT: { flex: 1, fontFamily: F.s, fontSize: 12.5, color: C.primary },
  sRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderColor: C.line, marginTop: 4 },
  sV: { fontFamily: F.m, fontSize: 12.5, color: C.black }, sP: { width: 62, textAlign: 'right', fontFamily: F.b, fontSize: 12.5, color: C.primary },
});
