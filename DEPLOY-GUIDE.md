# BCC Android v1.4 — deployment guide

## 1. Supabase (SQL Editor -> New query -> paste -> Run), in this order
Already done earlier (skip): APP_FEATURES.sql, APP_FEATURES_2_REPLIES.sql, BCC_DEVICE_SESSION_MANAGEMENT.sql
1. `supabase/APP_UPDATE_3_RESULTS_AND_REALTIME.sql`
   - result-declaration trigger (website declare -> one announcement row), popup acknowledgements,
     discussion-avatar function, realtime for notifications/lectures/notes/homework/comments.
2. `supabase/APP_UPDATE_4_SESSION_ENFORCEMENT.sql`   (needs BCC_DEVICE_SESSION_MANAGEMENT.sql first)
   - restrictive RLS: a revoked login session is denied by every protected table and storage bucket.
3. Edge functions (Dashboard -> Edge Functions -> open each -> Code -> paste -> Deploy):
   `supabase/functions-patched/{start-quiz,submit-quiz,attempt-result,admin-create-user}/index.ts`
   - one added check so a revoked session cannot call them either (they use the service role internally).

## 2. Website (browser sessions)
Replace the website's `app.js` with `website-device-sessions/app.js`. Changes: registers a "web" device session after login,
validates it every 30 s / on tab focus, signs the browser out silently when replaced, and uses
`signOut({ scope: 'local' })` so logging out of one device never signs out the others.
Until the website is updated the browser limit is NOT enforced (only the Android side is).

## 3. GitHub -> Actions -> Build Android APK
Upload this whole folder (new packages: expo-av, expo-linear-gradient, expo-navigation-bar are installed by the build).
