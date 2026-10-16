# Brilliant Coaching Centre — Android app (React Native / Expo)

Same Supabase project as the website (same logins, tables, RPCs, storage and edge functions).

## What's inside
- **Students:** Home dashboard (photo, greeting, date, bell), Lectures (rotate / full-screen + comments), Notes, Homework,
  Quizzes, AI Study Hub, Marks, Leaderboard, Notifications. Navy bottom bar: Home · Lectures · Notes · Homework · More (right menu).
- **Teachers** (new role from Teacher-Portal v2): dashboard limited to assigned classes, Students (read-only), Content, Quizzes, Marks, Leaderboard.
- **Admin:** everything above + create students + **Teachers** page (create, class access, activate/deactivate, reset password).
- Inactive accounts are blocked at login.

## Supabase to-do (one time)
1. Run `supabase/APP_FEATURES.sql` in Supabase → SQL Editor. It creates:
   `lecture_comments`, `app_notifications`, `notification_reads` (+ security policies).
   Until then the app works normally: comments say "not enabled yet" and notifications stay at 0.
2. Deploy the updated edge function from the Teacher-Portal v2 zip (`admin-create-user`) and run its two migrations
   (needed for the Teachers page).

## Notifications
Created automatically when a teacher/admin uploads a lecture, note, homework, AI resource, a new active quiz, or declares a result.
Students see a red count on the bell; tapping opens the item. (In-app only — phone push notifications would need Firebase.)

## Build
GitHub → Actions → **Build Android APK** → Run workflow → download from Releases. No terminal needed.
Colours/theme: `src/theme.js`. Logo used in login + side menu: `assets/logo.png`. Splash logo: `assets/shield.png`.

## v1.2 notes
- Phone Back button / back gesture undoes one step (history). On Home it exits the app; closes menus/full-screen first.
- Leaderboards (latest quiz, cumulative, exams): gold/silver/bronze podium, 1st centre & tallest; current student highlighted.
- Student top-left = profile photo (opens profile); teacher top-left = logo.png.
- Lectures stay inside the app (navigation to YouTube is blocked).
- New dependency: expo-linear-gradient (installed automatically by the GitHub build).

## v1.3 notes
- Lecture discussion: classmates see each other's comments; Reply button (threads); teachers/admin get a "Discussions" screen
  (More menu / dashboard) to reply and delete. Run `supabase/APP_FEATURES_2_REPLIES.sql` once (after APP_FEATURES.sql).
- Podium: photo + crown centred. List ranks are by position (4th, 5th, ...).
