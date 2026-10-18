-- =====================================================================
-- BCC app update 3: result-declaration announcements + realtime
-- Run once in Supabase -> SQL Editor (after APP_FEATURES.sql). Safe to re-run.
--
-- HOW THE WEBSITE TRIGGERS THE ANDROID POPUP
--   The website already runs:  update academic_exam_sets set result_declared = true ...
--   A database trigger below turns that change into ONE row in app_notifications
--   (kind = 'result', ref_id = exam id, class_no = the exam's class).
--   The Android app reads that row (realtime + on open/resume), checks that the exam is
--   really declared, and shows the popup once per student.
--   => no website code change is needed.
-- =====================================================================

-- 1) per-student acknowledgement of the popup (separate from the notification "read" flag)
create table if not exists public.result_popup_acks (
  user_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  action          text not null default 'dismissed' check (action in ('viewed','dismissed')),
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.result_popup_acks enable row level security;
drop policy if exists result_popup_acks_select on public.result_popup_acks;
create policy result_popup_acks_select on public.result_popup_acks for select to authenticated using (user_id = auth.uid());
drop policy if exists result_popup_acks_insert on public.result_popup_acks;
create policy result_popup_acks_insert on public.result_popup_acks for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.result_popup_acks to authenticated;

-- 2) exactly one result announcement per exam (removes older duplicates first)
delete from public.app_notifications a using public.app_notifications b
 where a.kind = 'result' and b.kind = 'result' and a.ref_id is not null and a.ref_id = b.ref_id
   and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists app_notifications_result_unique
  on public.app_notifications (ref_id) where kind = 'result';

-- 3) trigger: declared -> announce | withdrawn -> remove | declared again -> announce again
create or replace function public.bcc_announce_result()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.result_declared, false)
     and (tg_op = 'INSERT' or not coalesce(old.result_declared, false)) then
    insert into public.app_notifications (class_no, kind, title, body, ref_id)
    values (new.class_no, 'result', '🎓 Examination Result Declared!',
            format('Your %s result is now available. Tap to view your marks and performance.', new.exam_name),
            new.id)
    on conflict (ref_id) where kind = 'result' do nothing;
  elsif tg_op = 'UPDATE' and not coalesce(new.result_declared, false) and coalesce(old.result_declared, false) then
    delete from public.app_notifications where kind = 'result' and ref_id = new.id; -- withdrawn
  end if;
  return new;
end $$;
drop trigger if exists trg_bcc_announce_result on public.academic_exam_sets;
create trigger trg_bcc_announce_result
  after insert or update of result_declared on public.academic_exam_sets
  for each row execute function public.bcc_announce_result();

-- 4) portal profile photos for lecture discussions (same function the website uses)
create or replace function public.get_lecture_discussion_avatars(p_lecture_id uuid)
returns table(user_id uuid, photo_path text)
language sql stable security definer set search_path = '' as $$
  select c.user_id, coalesce(sp.photo_path, p.photo_path) as photo_path
  from (select distinct lc.user_id from public.lecture_comments lc where lc.lecture_id = p_lecture_id) c
  join public.profiles p on p.id = c.user_id
  left join public.student_profiles sp on sp.user_id = c.user_id
  where auth.uid() is not null and coalesce(sp.photo_path, p.photo_path) is not null;
$$;
revoke all on function public.get_lecture_discussion_avatars(uuid) from public, anon;
grant execute on function public.get_lecture_discussion_avatars(uuid) to authenticated;

-- 5) realtime (new announcements / new lectures, notes, homework and comments arrive without refresh)
alter table public.lecture_comments replica identity full;
do $$
declare t text;
begin
  foreach t in array array['app_notifications','lectures','notes','homework','lecture_comments'] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
