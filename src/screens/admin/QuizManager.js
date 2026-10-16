import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Async, Btn, Card, Empty, Field, Head, Icon, Page, Pill, Row, Select, Sheet, Label, SectionTitle } from '../../components/ui';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { localDateTimeInput, parseLocalDateTime, subjectsForClass, useAsync } from '../../lib/helpers';
import { notify } from '../../lib/notifications';
import { C, F } from '../../theme';

const blankQ = () => ({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', explanation: '' });

export function QuizManager() {
  const { toast, loading } = useUi();
  const { classes } = useApp();
  const [editor, setEditor] = useState(null); // {id|null}
  const q = useAsync(async () => {
    const [qz, subs] = await Promise.all([
      sb.from('quizzes').select('*,subjects(name)').in('class_no', classes.length ? classes : [0]).order('created_at', { ascending: false }),
      Promise.all(classes.map((c) => subjectsForClass(c))),
    ]);
    if (qz.error) throw qz.error;
    return { quizzes: qz.data || [], subjects: subs.flat() };
  }, [classes.join(',')]);

  const del = (x) => Alert.alert('Delete quiz?', 'Its questions and submitted attempts will also be deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
    loading(true, 'Deleting quiz...');
    try { const { error } = await sb.from('quizzes').delete().eq('id', x.id); if (error) throw error; toast('Quiz deleted.', 'success'); q.reload(); }
    catch (e) { toast(e.message, 'error'); } finally { loading(false); }
  } }]);

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Quiz Manager" sub="Create weekly, monthly and chapter-wise quizzes." right={<Btn small icon="plus" label="New" onPress={() => setEditor({ id: null })} />} />
      <Async q={q}>
        {({ quizzes, subjects }) => (
          <>
            {quizzes.length ? quizzes.map((x) => (
              <Card key={x.id}>
                <Text style={st.t}>{x.title}</Text>
                <Row style={{ marginVertical: 8 }}>
                  <Pill text={x.quiz_type} /><Pill text={`Class ${x.class_no}`} /><Pill text={x.subjects?.name || 'All'} /><Pill text={`${x.total_marks} marks`} /><Pill text={`${x.duration_minutes} min`} />
                  {x.is_active ? <Pill active text="Active" /> : <Pill text="Inactive" />}
                </Row>
                <Row><Btn small kind="ghost" icon="pen" label="Edit" onPress={() => setEditor({ id: x.id })} /><Btn small kind="danger" icon="trash" label="Delete" onPress={() => del(x)} /></Row>
              </Card>
            )) : <Empty icon="list-check" title="No quizzes yet" />}
            <QuizEditor state={editor} subjects={subjects} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); q.reload(); }} />
          </>
        )}
      </Async>
    </Page>
  );
}

function QuizEditor({ state, subjects, onClose, onSaved }) {
  const { profile, classes } = useApp();
  const { toast, loading } = useUi();
  const [f, setF] = useState(null);
  const [qs, setQs] = useState([blankQ()]);
  const id = state?.id;

  React.useEffect(() => {
    if (!state) return;
    (async () => {
      if (!id) { setF({ title: '', cls: String(classes[0] || 10), type: 'Weekly', subject: '', duration: '30', start: '', end: '', active: 'true' }); setQs([blankQ()]); return; }
      const { data, error } = await sb.from('quizzes').select('*,quiz_questions(*)').eq('id', id).single();
      if (error) { toast(error.message, 'error'); return onClose(); }
      setF({ title: data.title, cls: String(data.class_no), type: data.quiz_type, subject: data.subject_id, duration: String(data.duration_minutes), start: localDateTimeInput(data.start_at), end: localDateTimeInput(data.end_at), active: String(data.is_active !== false) });
      setQs((data.quiz_questions || []).sort((a, b) => a.position - b.position).map((x) => ({ question_text: x.question_text, option_a: x.option_a, option_b: x.option_b, option_c: x.option_c, option_d: x.option_d, correct_option: x.correct_option, explanation: x.explanation || '' })));
    })();
  }, [state]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const setQ = (i, k) => (v) => setQs((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const subjectOpts = subjects.filter((s) => !f || String(s.class_no) === f.cls).map((s) => ({ label: `Class ${s.class_no} • ${s.name}`, value: s.id }));

  const save = async () => {
    const valid = qs.filter((x) => x.question_text.trim());
    if (!f.title.trim() || !valid.length) return toast('Quiz title and at least one question are required.', 'error');
    if (!f.subject) return toast('Select a subject.', 'error');
    loading(true, 'Saving quiz...');
    try {
      const payload = { title: f.title.trim(), class_no: Number(f.cls), quiz_type: f.type, subject_id: f.subject, duration_minutes: Number(f.duration) || 30, total_marks: valid.length, start_at: parseLocalDateTime(f.start), end_at: parseLocalDateTime(f.end), is_active: f.active === 'true', created_by: profile.id };
      let quizId = id;
      if (id) {
        const u = await sb.from('quizzes').update(payload).eq('id', id); if (u.error) throw u.error;
        const d = await sb.from('quiz_questions').delete().eq('quiz_id', id); if (d.error) throw d.error;
      } else {
        const ins = await sb.from('quizzes').insert(payload).select().single(); if (ins.error) throw ins.error; quizId = ins.data.id;
      }
      const rows = valid.map((x, i) => ({ ...x, position: i + 1, correct_marks: 1, wrong_marks: 0, quiz_id: quizId }));
      const e2 = await sb.from('quiz_questions').insert(rows); if (e2.error) throw e2.error;
      if (!id && payload.is_active) await notify({ classNo: payload.class_no, kind: 'quiz', title: `New quiz: ${payload.title}`, body: `${payload.quiz_type} • ${payload.duration_minutes} min • ${payload.total_marks} marks`, refId: quizId, refSubjectId: payload.subject_id });
      toast('Quiz saved.', 'success'); onSaved();
    } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
  };

  return (
    <Sheet visible={!!state} onClose={onClose} title={id ? 'Edit quiz' : 'Create quiz'} footer={<><Btn small kind="ghost" label="Cancel" onPress={onClose} /><Btn small icon="check" label={id ? 'Save changes' : 'Create quiz'} onPress={save} /></>}>
      {f && (
        <>
          <Field label="Title" value={f.title} onChangeText={set('title')} autoCapitalize="sentences" />
          <Row style={{ gap: 12 }}>
            <Select style={{ flex: 1 }} label="Class" value={f.cls} onChange={(v) => { set('cls')(v); set('subject')(''); }} options={classes.map((c) => ({ label: `Class ${c}`, value: String(c) }))} />
            <Select style={{ flex: 1 }} label="Type" value={f.type} onChange={set('type')} options={['Weekly', 'Monthly', 'Chapter-wise'].map((x) => ({ label: x, value: x }))} />
          </Row>
          <Select label="Subject" value={f.subject} onChange={set('subject')} options={subjectOpts} />
          <Row style={{ gap: 12 }}>
            <Field style={{ flex: 1 }} label="Duration (min)" value={f.duration} onChangeText={set('duration')} keyboardType="numeric" />
            <Select style={{ flex: 1 }} label="Active" value={f.active} onChange={set('active')} options={[{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]} />
          </Row>
          <Field label="Start (YYYY-MM-DD HH:MM)" value={f.start} onChangeText={set('start')} placeholder="2026-10-20 16:00" hint="Leave empty to start immediately." />
          <Field label="End (YYYY-MM-DD HH:MM)" value={f.end} onChangeText={set('end')} placeholder="2026-10-20 18:00" hint="Leave empty for no end time." />
          <Label style={{ marginBottom: 6 }}>Total marks equal the number of questions (1 mark each, no negative marking).</Label>
          <SectionTitle>Questions ({qs.filter((x) => x.question_text.trim()).length})</SectionTitle>
          {qs.map((x, i) => (
            <View key={i} style={st.qBox}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={st.qn}>Question {i + 1}</Text>
                {qs.length > 1 && <Btn small kind="danger" icon="trash" label="" onPress={() => setQs((a) => a.filter((_, j) => j !== i))} style={{ paddingHorizontal: 10, paddingVertical: 5 }} />}
              </Row>
              <Field label="Question" value={x.question_text} onChangeText={setQ(i, 'question_text')} multiline autoCapitalize="sentences" />
              {['a', 'b', 'c', 'd'].map((k) => <Field key={k} label={`Option ${k.toUpperCase()}`} value={x[`option_${k}`]} onChangeText={setQ(i, `option_${k}`)} autoCapitalize="sentences" />)}
              <Select label="Correct option" value={x.correct_option} onChange={setQ(i, 'correct_option')} options={['A', 'B', 'C', 'D'].map((l) => ({ label: l, value: l }))} />
              <Field label="Explanation" value={x.explanation} onChangeText={setQ(i, 'explanation')} multiline autoCapitalize="sentences" />
            </View>
          ))}
          <Btn kind="soft" icon="plus" label="Add question" onPress={() => setQs((a) => [...a, blankQ()])} full />
        </>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  t: { fontFamily: F.b, fontSize: 15, color: C.primary },
  qBox: { backgroundColor: C.soft, borderRadius: 14, padding: 12, marginBottom: 12 },
  qn: { fontFamily: F.b, fontSize: 13, color: C.primary },
});
