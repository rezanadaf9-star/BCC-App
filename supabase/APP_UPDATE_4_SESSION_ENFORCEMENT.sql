-- =====================================================================
-- BCC app update 4: server-side enforcement for device sessions
-- PREREQUISITE: BCC_DEVICE_SESSION_MANAGEMENT.sql has been run.  Safe to re-run.
--
-- What BCC_DEVICE_SESSION_MANAGEMENT.sql does:   records sessions and revokes the OLDEST
--   session of the same platform (student/teacher: 1 web + 1 android, admin: 2 + 2).
-- What it does NOT do:   stop an already-issued Supabase JWT from reading data.
-- This file closes that gap with RESTRICTIVE row-level-security policies: once a session is
-- revoked, every protected table and storage bucket denies it (reads AND writes).
-- Sessions that were never registered (legacy logins) are not blocked, so rollout is smooth.
-- =====================================================================
create or replace function public.bcc_session_not_revoked()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.bcc_device_sessions d
    where d.user_id = auth.uid()
      and d.auth_session_id = public.bcc_current_auth_session_id()
      and d.revoked_at is not null);
$$;
revoke all on function public.bcc_session_not_revoked() from public;
grant execute on function public.bcc_session_not_revoked() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','student_profiles','subjects','lectures','notes','homework','notebooklm_resources',
    'quizzes','quiz_questions','quiz_attempts','quiz_sessions','lecture_comments','app_notifications',
    'notification_reads','result_popup_acks','academic_exam_sets','academic_exam_subjects',
    'student_exam_marks','teacher_class_assignments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists bcc_session_guard on public.%I', t);
      execute format('create policy bcc_session_guard on public.%I as restrictive for all to authenticated
                      using ((select public.bcc_session_not_revoked()))
                      with check ((select public.bcc_session_not_revoked()))', t);
    end if;
  end loop;
end $$;

-- private files (content + profile photos)
drop policy if exists bcc_session_guard_storage on storage.objects;
create policy bcc_session_guard_storage on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('bcc-content','student-photos') or (select public.bcc_session_not_revoked()))
  with check (bucket_id not in ('bcc-content','student-photos') or (select public.bcc_session_not_revoked()));

-- let each device see ONLY its own session rows so the apps can react instantly (realtime)
grant select on public.bcc_device_sessions to authenticated;
drop policy if exists bcc_sessions_own_select on public.bcc_device_sessions;
create policy bcc_sessions_own_select on public.bcc_device_sessions for select to authenticated using (user_id = auth.uid());
alter table public.bcc_device_sessions replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bcc_device_sessions') then
    alter publication supabase_realtime add table public.bcc_device_sessions;
  end if;
end $$;
