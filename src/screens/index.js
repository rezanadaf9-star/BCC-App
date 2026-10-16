import React from 'react';
import Dashboard from './student/Dashboard';
import Notifications from './student/Notifications';
import { Lectures, LecturesSubject, LecturePlayer, Notes, NotesSubject, Homework, HomeworkSubject, NotebookLM } from './student/Content';
import { Quizzes, QuizRun, QuizResult } from './student/Quiz';
import { StudentMarks, StudentAcademicLeaderboard, StudentLeaderboard } from './student/Marks';
import { StaffDashboard } from './admin/Dashboard';
import { Students } from './admin/Students';
import { Teachers } from './admin/Teachers';
import { Content } from './admin/Content';
import { QuizManager } from './admin/QuizManager';
import { LectureDiscussions, LectureDiscussion } from './admin/Discussions';
import { Marks, MarksClass, AcademicLeaderboardExam } from './admin/Marks';
import { AdminLeaderboard, AdminLeaderboardClass } from './admin/Leaderboard';
import { useApp } from '../lib/app';

// `leaderboard` is shared by both roles
const Leaderboard = (p) => {
  const { isStudent } = useApp();
  return isStudent ? <StudentLeaderboard {...p} /> : <AdminLeaderboard {...p} />;
};

/**
 * name -> { component, title (top bar), tab (bottom-bar item to highlight; 'more' = right menu),
 *           home (renders its own header), fullscreen (no bars at all) }
 */
export const SCREENS = {
  // student
  dashboard: { component: Dashboard, home: true },
  lectures: { component: Lectures, title: 'Lectures' },
  'lectures-subject': { detail: true, component: LecturesSubject, title: 'Lectures', tab: 'lectures' },
  'lecture-player': { detail: true, component: LecturePlayer, title: 'Lecture', tab: 'lectures' },
  notes: { component: Notes, title: 'Notes' },
  'notes-subject': { detail: true, component: NotesSubject, title: 'Notes', tab: 'notes' },
  homework: { component: Homework, title: 'Homework' },
  'homework-subject': { detail: true, component: HomeworkSubject, title: 'Homework', tab: 'homework' },
  quizzes: { component: Quizzes, title: 'Quizzes', tab: 'more' },
  'quiz-run': { component: QuizRun, fullscreen: true },
  'quiz-result': { detail: true, component: QuizResult, title: 'Quiz result', tab: 'more' },
  notebooklm: { component: NotebookLM, title: 'AI Study Hub', tab: 'more' },
  'student-marks': { component: StudentMarks, title: 'Marks', tab: 'more' },
  'student-academic-leaderboard': { detail: true, component: StudentAcademicLeaderboard, title: 'Exam leaderboard', tab: 'more' },
  leaderboard: { component: Leaderboard, title: 'Leaderboard', tab: 'more' },
  notifications: { component: Notifications, title: 'Notifications', tab: 'more' },
  // admin / teacher
  'admin-dashboard': { component: StaffDashboard, home: true },
  'teacher-dashboard': { component: StaffDashboard, home: true },
  students: { component: Students, title: 'Students' },
  teachers: { component: Teachers, title: 'Teachers', tab: 'more' },
  content: { component: Content, title: 'Content' },
  'lecture-discussions': { component: LectureDiscussions, title: 'Discussions', tab: 'more' },
  'lecture-discussion': { detail: true, component: LectureDiscussion, title: 'Discussion', tab: 'more' },
  'quiz-manager': { component: QuizManager, title: 'Quiz Manager' },
  marks: { component: Marks, title: 'Marks', tab: 'more' },
  'marks-class': { detail: true, component: MarksClass, title: 'Class marks', tab: 'more' },
  'academic-leaderboard-exam': { detail: true, component: AcademicLeaderboardExam, title: 'Exam leaderboard', tab: 'more' },
  'leaderboard-class': { detail: true, component: AdminLeaderboardClass, title: 'Class leaderboard', tab: 'more' },
};
