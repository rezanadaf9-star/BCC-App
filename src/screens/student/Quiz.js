import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Async, Btn, Card, Empty, Head, Icon, Page, Pill, Row, Label } from '../../components/ui';
import { useApp, useUi } from '../../lib/app';
import { sb } from '../../lib/supabase';
import { fmtDateTime, useAsync } from '../../lib/helpers';
import { C, F, R, shadow } from '../../theme';

/** supabase-js hides the JSON error body of non-2xx edge function responses; dig it out. */
export async function fnInvoke(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ------------------------------- list ------------------------------- */
export function Quizzes({ nav }) {
  const { classNo, profile } = useApp();
  const { toast, loading } = useUi();
  const q = useAsync(async () => {
    const { data, error } = await sb.from('quizzes').select('*,subjects(name)').eq('class_no', classNo).eq('is_active', true).order('start_at', { ascending: false });
    if (error) throw error;
    const at = await sb.from('quiz_attempts').select('quiz_id,score,total_marks,submitted_at').eq('student_id', profile.id);
    return { rows: data || [], done: new Map((at.data || []).map((a) => [a.quiz_id, a])) };
  }, [classNo]);

  const start = (x) => {
    if (x.start_at && new Date(x.start_at) > new Date()) return toast('This quiz has not started yet.', 'error');
    if (x.end_at && new Date(x.end_at) < new Date()) return toast('This quiz has ended.', 'error');
    Alert.alert(
      'Start secure quiz?',
      `${x.duration_minutes} minutes • ${x.total_marks} marks.\n\nOnce started, leaving the app, switching apps or pressing Back will automatically submit your quiz. Screenshots are disabled.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Start', onPress: () => nav.push('quiz-run', { quiz: x }) }]
    );
  };

  return (
    <Page onRefresh={q.reload} refreshing={q.loading && !!q.data}>
      <Head title="Quizzes" sub="Weekly, monthly and chapter-wise quizzes currently active." />
      <Async q={q}>
        {({ rows, done }) => rows.length === 0 ? <Empty icon="circle-question" title="No active quiz" text="There is no active quiz for your class right now." /> : rows.map((x) => {
          const a = done.get(x.id);
          return (
            <Card key={x.id}>
              <Text style={st.qTitle}>{x.title}</Text>
              <Row style={{ marginVertical: 8 }}>
                <Pill text={x.quiz_type} /><Pill text={x.subjects?.name || 'All subjects'} /><Pill text={`${x.duration_minutes} min`} /><Pill text={`${x.total_marks} marks`} />
                {a && <Pill active text={`Attempted: ${a.score}/${a.total_marks}`} />}
              </Row>
              <Label>{x.start_at ? `Starts ${fmtDateTime(x.start_at)}` : ''}{x.end_at ? ` • Ends ${fmtDateTime(x.end_at)}` : ''}</Label>
              <View style={{ marginTop: 12 }}>
                {a ? <Btn small kind="ghost" label="View result" icon="chart-simple" onPress={() => nav.push('quiz-result', { quizId: x.id })} style={{ alignSelf: 'flex-start' }} />
                  : <Btn small label="Start quiz" icon="play" onPress={() => start(x)} style={{ alignSelf: 'flex-start' }} />}
              </View>
            </Card>
          );
        })}
      </Async>
    </Page>
  );
}

/* ------------------------------- run ------------------------------- */
export function QuizRun({ params, nav }) {
  usePreventScreenCapture(); // no screenshots / screen recording / recents preview while a quiz is running
  const { toast, loading } = useUi();
  const quiz = params.quiz;
  const [phase, setPhase] = useState('starting'); // starting | running | error
  const [errMsg, setErrMsg] = useState('');
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(0);
  const session = useRef({ id: null, expires: null });
  const submitting = useRef(false);
  const done = useRef(false);
  const answersRef = useRef({});
  const qsRef = useRef([]);
  answersRef.current = answers;
  qsRef.current = questions;

  /* start the server-side secure session */
  useEffect(() => {
    (async () => {
      try {
        const d = await fnInvoke('start-quiz', { quiz_id: quiz.id });
        const qs = (d.questions || []).map((q) => ({
          id: q.id ?? q.question_id, position: q.position ?? q.question_position, question_text: q.question_text,
          option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
        })).sort((a, b) => Number(a.position) - Number(b.position));
        if (!qs.length) throw new Error('This quiz has no questions yet.');
        if (qs.some((q) => !q.id)) throw new Error('Quiz question data is incomplete. Please contact BCC staff.');
        session.current = { id: d.session_id, expires: d.expires_at ? new Date(d.expires_at).getTime() : Date.now() + Number(quiz.duration_minutes) * 60000 };
        setQuestions(qs);
        setPhase('running');
      } catch (e) {
        setErrMsg(e.message || 'Could not start the quiz.');
        setPhase('error');
      }
    })();
  }, []);

  const submit = useCallback(async (reason = 'manual') => {
    if (submitting.current || done.current || !session.current.id) return false;
    submitting.current = true;
    const ans = { ...answersRef.current };
    qsRef.current.forEach((q) => { if (!(q.id in ans)) ans[q.id] = null; });
    loading(true, 'Submitting quiz...');
    try {
      const d = await fnInvoke('submit-quiz', { quiz_id: quiz.id, session_id: session.current.id, answers: ans, submission_reason: reason });
      done.current = true;
      nav.setGuard(null);
      toast(
        reason === 'time_expired' ? 'Time ended. Your quiz was submitted.' :
        reason === 'tab_switch' ? 'You left the quiz. Your quiz was submitted.' :
        reason === 'browser_back' ? 'You pressed Back. Your quiz was submitted.' : 'Quiz submitted successfully.', 'success');
      nav.replace('quiz-result', { quizId: quiz.id, result: { attempt: d.attempt, answers: d.answers || [], questions: d.questions || qsRef.current }, quiz });
      return true;
    } catch (e) {
      submitting.current = false;
      toast(e.message || 'Could not submit quiz.', 'error');
      return false;
    } finally { loading(false); }
  }, [quiz]);

  /* timer */
  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      const sec = Math.max(0, Math.ceil((session.current.expires - Date.now()) / 1000));
      setLeft(sec);
      if (sec <= 0) submit('time_expired');
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, submit]);

  /* anti-cheat: leaving the app submits the quiz; retry when coming back if the network failed */
  const pendingAuto = useRef(null);
  useEffect(() => {
    if (phase !== 'running') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') { pendingAuto.current = 'tab_switch'; submit('tab_switch'); }
      else if (s === 'active' && pendingAuto.current && !done.current) submit(pendingAuto.current);
    });
    return () => sub.remove();
  }, [phase, submit]);

  /* Android Back button */
  useEffect(() => {
    nav.setGuard(() => {
      if (done.current) return false;
      if (phase === 'error') return false;
      Alert.alert('Leave quiz?', 'Leaving will submit your quiz now. You cannot resume it later.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Submit & leave', style: 'destructive', onPress: () => submit('browser_back') },
      ]);
      return true;
    });
    return () => nav.setGuard(null);
  }, [phase, submit]);

  const confirmSubmit = () => {
    const unanswered = questions.filter((q) => !answers[q.id]).length;
    Alert.alert('Submit this quiz?', `${unanswered ? `${unanswered} question${unanswered > 1 ? 's are' : ' is'} unanswered. ` : ''}Once submitted, your attempt is final.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Submit', onPress: () => submit('manual') },
    ]);
  };

  if (phase === 'starting')
    return <SafeAreaView style={st.center}><Icon name="shield-halved" size={36} color={C.primary} /><Text style={st.qTitle}>Starting secure quiz…</Text></SafeAreaView>;
  if (phase === 'error')
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.soft, padding: 24, justifyContent: 'center' }}>
        <Empty icon="triangle-exclamation" title="Could not start the quiz" text={errMsg} />
        <Btn label="Back" icon="arrow-left" onPress={() => { nav.setGuard(null); nav.pop(); }} style={{ alignSelf: 'center' }} />
      </SafeAreaView>
    );

  const q = questions[idx];
  const mm = String(Math.floor(left / 60)); const ss = String(left % 60).padStart(2, '0');
  const answered = questions.filter((x) => answers[x.id]).length;
  const last = idx === questions.length - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.primary }} edges={['top']}>
      <View style={st.top}>
        <View style={{ flex: 1 }}>
          <Text style={st.kicker}>{quiz.quiz_type || 'QUIZ'}</Text>
          <Text style={st.topTitle} numberOfLines={1}>{quiz.title}</Text>
        </View>
        <View style={[st.timer, left < 60 && { backgroundColor: C.alert }]}><Icon name="clock" size={12} color={left < 60 ? C.white : C.primary} /><Text style={[st.timerText, left < 60 && { color: C.white }]}>{mm}:{ss}</Text></View>
      </View>
      <View style={st.body}>
        <View style={st.progRow}>
          <Text style={st.prog}>Question {idx + 1} of {questions.length}</Text>
          <Text style={st.prog}>{answered} answered</Text>
        </View>
        <View style={st.track}><View style={[st.fill, { width: `${((idx + 1) / questions.length) * 100}%` }]} /></View>

        <ScrollView contentContainerStyle={{ paddingVertical: 14 }} showsVerticalScrollIndicator={false}>
          <View style={st.qCard}>
            <Text style={st.qNo}>Question {idx + 1}</Text>
            <Text style={st.qText} selectable={false}>{q.question_text}</Text>
            {['A', 'B', 'C', 'D'].map((L) => {
              const txt = q[`option_${L.toLowerCase()}`];
              if (!txt) return null;
              const on = answers[q.id] === L;
              return (
                <Pressable key={L} onPress={() => setAnswers((a) => ({ ...a, [q.id]: on ? null : L }))} style={[st.opt, on && st.optOn]}>
                  <View style={[st.letter, on && { backgroundColor: C.primary }]}><Text style={[st.letterText, on && { color: C.accent }]}>{L}</Text></View>
                  <Text style={[st.optText, on && { fontFamily: F.s }]}>{txt}</Text>
                  {on && <Icon name="circle-check" size={18} color={C.primary} />}
                </Pressable>
              );
            })}
          </View>
          <View style={st.dots}>
            {questions.map((x, i) => (
              <Pressable key={x.id} onPress={() => setIdx(i)} style={[st.dot, answers[x.id] && { backgroundColor: C.primary }, i === idx && { borderColor: C.primary, borderWidth: 2 }]}>
                <Text style={[st.dotText, answers[x.id] && { color: C.accent }]}>{i + 1}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={st.nav}>
          <Btn kind="ghost" icon="arrow-left" label="Previous" disabled={idx === 0} onPress={() => setIdx(idx - 1)} style={{ flex: 1 }} />
          {last ? <Btn kind="yellow" icon="check" label="Submit Quiz" onPress={confirmSubmit} style={{ flex: 1 }} />
            : <Btn icon="arrow-right" label="Next" onPress={() => setIdx(idx + 1)} style={{ flex: 1 }} />}
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------- result ------------------------------- */
export function QuizResult({ params, nav }) {
  const q = useAsync(async () => {
    if (params.result) return { ...params.result, quiz: params.quiz };
    const { data, error } = await sb.from('quiz_attempts').select('*,quizzes(*,subjects(name))').eq('quiz_id', params.quizId).eq('student_id', (await sb.auth.getUser()).data.user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No attempt found.');
    const r = await fnInvoke('attempt-result', { attempt_id: data.id });
    return { attempt: data, answers: r.answers || [], questions: r.questions || [], quiz: data.quizzes };
  }, [params.quizId]);

  return (
    <Page onRefresh={q.reload}>
      <Async q={q}>
        {({ attempt: a, answers, questions, quiz }) => (
          <>
            <View style={st.scoreCard}>
              <Text style={st.scoreLabel}>{quiz?.title || 'Quiz'} • submitted</Text>
              <Text style={st.score}>{a.score}<Text style={{ fontSize: 24, color: C.soft }}>/{a.total_marks}</Text></Text>
              <Row style={{ justifyContent: 'center', marginTop: 8 }}>
                <Pill active text={`${a.correct_count} correct`} /><Pill text={`${a.wrong_count} wrong`} /><Pill text={`${a.unattempted_count} skipped`} />
              </Row>
            </View>
            <Text style={st.sec}>Answer analysis</Text>
            {questions.map((qq, i) => {
              const x = answers.find((y) => y.question_id === qq.id);
              const status = x?.status;
              const tone = status === 'correct' ? C.success : status === 'wrong' ? C.alert : C.grey;
              return (
                <Card key={qq.id} style={{ borderLeftWidth: 5, borderLeftColor: tone }}>
                  <Text style={st.aq}>{i + 1}. {qq.question_text}</Text>
                  <Text style={st.ap}>Your answer: <Text style={{ fontFamily: F.s, color: tone }}>{x?.selected_option || 'Not attempted'}</Text>  •  Correct: <Text style={{ fontFamily: F.s, color: C.success }}>{qq.correct_option}</Text>  •  Marks: {x?.marks_awarded ?? 0}</Text>
                  {!!qq.explanation && <Text style={st.ap}><Text style={{ fontFamily: F.s, color: C.primary }}>Explanation: </Text>{qq.explanation}</Text>}
                </Card>
              );
            })}
            <Btn icon="arrow-left" label="Back to Quizzes" onPress={() => nav.reset('quizzes')} style={{ marginTop: 6 }} />
          </>
        )}
      </Async>
    </Page>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.soft },
  qTitle: { fontFamily: F.b, fontSize: 15.5, color: C.primary },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  kicker: { fontFamily: F.s, fontSize: 10.5, color: C.accent, letterSpacing: 1.5 },
  topTitle: { fontFamily: F.b, fontSize: 16, color: C.white },
  timer: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: C.accent, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14 },
  timerText: { fontFamily: F.b, fontSize: 15, color: C.primary, fontVariant: ['tabular-nums'] },
  body: { flex: 1, backgroundColor: C.soft, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  prog: { fontFamily: F.s, fontSize: 12, color: C.primary },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(27,20,100,0.12)', overflow: 'hidden' },
  fill: { height: 8, backgroundColor: C.primary, borderRadius: 4 },
  qCard: { backgroundColor: C.white, borderRadius: R.lg, padding: 16, ...shadow },
  qNo: { fontFamily: F.s, fontSize: 11.5, color: C.grey, marginBottom: 6 },
  qText: { fontFamily: F.s, fontSize: 16.5, color: C.black, lineHeight: 24, marginBottom: 14 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 10 },
  optOn: { borderColor: C.primary, backgroundColor: C.soft },
  letter: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: F.b, color: C.primary, fontSize: 14 },
  optText: { flex: 1, fontFamily: F.m, fontSize: 14, color: C.black },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  dot: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  dotText: { fontFamily: F.s, fontSize: 12, color: C.primary },
  nav: { flexDirection: 'row', gap: 12, paddingTop: 8, paddingBottom: 6 },
  scoreCard: { backgroundColor: C.primary, borderRadius: R.lg, padding: 22, alignItems: 'center', marginBottom: 6 },
  scoreLabel: { fontFamily: F.m, fontSize: 12.5, color: C.accent },
  score: { fontFamily: F.b, fontSize: 56, color: C.white, lineHeight: 70 },
  sec: { fontFamily: F.b, fontSize: 16, color: C.primary, marginVertical: 12 },
  aq: { fontFamily: F.s, fontSize: 13.5, color: C.black, marginBottom: 6 },
  ap: { fontFamily: F.r, fontSize: 12, color: C.grey, marginTop: 3, lineHeight: 18 },
});
