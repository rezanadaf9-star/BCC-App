import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { decode } from 'base64-arraybuffer';
import { sb } from './supabase';
import { AUTH_EMAIL_DOMAIN, ADMIN_EMAIL, SUPABASE_URL, SUPABASE_ANON_KEY, SCHOOL_TZ_OFFSET_MIN } from '../config';

export const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
export const initials = (n) =>
  (n || 'B').trim().split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
export const classText = (c) => (c ? `Class ${c}` : 'Class');
export const num = (v, d = 2) => Number(v || 0).toFixed(d);

export function rankLabel(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const m = n % 100;
  if (m >= 11 && m <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

export function authEmail(id) {
  const clean = String(id).trim();
  if (clean.toUpperCase() === 'ADMIN') return ADMIN_EMAIL;
  return `${clean.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${AUTH_EMAIL_DOMAIN}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

/* ---------- storage / photos (signed URLs are cached, so photos and files open instantly the 2nd time) ---------- */
const SIGNED = new Map(); // "bucket:path" -> { url, exp }
const cachedUrl = (k) => { const c = SIGNED.get(k); return c && c.exp > Date.now() ? c.url : null; };
const putUrl = (k, url, seconds) => { if (url) SIGNED.set(k, { url, exp: Date.now() + Math.max(30000, seconds * 800) }); };

export async function addPhotoUrls(rows) {
  const list = rows || [];
  const paths = [...new Set(list.map((r) => r.photo_path).filter(Boolean))];
  if (!paths.length) return list;
  try {
    const missing = paths.filter((p) => !cachedUrl(`p:${p}`));
    if (missing.length) {
      const { data, error } = await sb.storage.from('student-photos').createSignedUrls(missing, 3600);
      if (error) throw error;
      missing.forEach((p, i) => putUrl(`p:${p}`, data?.[i]?.signedUrl, 3600));
    }
    return list.map((r) => ({ ...r, photo_url: cachedUrl(`p:${r.photo_path}`) || '' }));
  } catch (e) {
    return list.map((r) => ({ ...r, photo_url: cachedUrl(`p:${r.photo_path}`) || '' }));
  }
}
export async function studentPhotoUrl(path) {
  if (!path) return '';
  const hit = cachedUrl(`p:${path}`);
  if (hit) return hit;
  try {
    const { data, error } = await sb.storage.from('student-photos').createSignedUrl(path, 3600);
    if (error) throw error;
    putUrl(`p:${path}`, data?.signedUrl, 3600);
    return data?.signedUrl || '';
  } catch (e) {
    return '';
  }
}
export async function signedUrl(path, seconds = 3600) {
  if (!path) return null;
  const hit = cachedUrl(`c:${path}`);
  if (hit && seconds >= 3600) return hit;
  const { data, error } = await sb.storage.from('bcc-content').createSignedUrl(path, seconds);
  if (error) return null;
  if (seconds >= 3600) putUrl(`c:${path}`, data?.signedUrl, seconds);
  return data?.signedUrl || null;
}
/** read-through cache lookup without a network call (used to start video players before the page finishes loading) */
export const peekSignedUrl = (path) => cachedUrl(`c:${path}`);

/**
 * Upload a local file (uri from a picker) to a Supabase bucket.
 * Streams straight from disk (no base64 in memory) so large lecture videos work;
 * falls back to a base64 upload for small files if streaming is rejected.
 */
export async function uploadLocalFile(bucket, path, uri, contentType, upsert = false) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess?.session?.access_token;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await FileSystem.uploadAsync(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': contentType || 'application/octet-stream',
        'x-upsert': upsert ? 'true' : 'false',
        'cache-control': 'max-age=0',
      },
    });
    if (res.status >= 200 && res.status < 300) return path;
    let msg = `Upload failed (${res.status})`;
    try { msg = JSON.parse(res.body)?.message || msg; } catch (_) {}
    throw new Error(msg);
  } catch (streamErr) {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || (info.size || 0) > 25 * 1024 * 1024) throw streamErr;
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const { error } = await sb.storage.from(bucket).upload(path, decode(b64), { contentType: contentType || 'application/octet-stream', upsert, cacheControl: '0' });
    if (error) throw error;
    return path;
  }
}

/** Download a stored content file and open the share/save sheet. */
export async function downloadAndShare(path, name) {
  const url = await signedUrl(path, 300);
  if (!url) throw new Error('Could not create download link. Check BCC storage access.');
  const ext = (path.split('.').pop() || '').split('?')[0];
  const safe = slug(name || 'bcc-file') || 'bcc-file';
  const dest = `${FileSystem.cacheDirectory}${safe}.${ext}`;
  const res = await FileSystem.downloadAsync(url, dest);
  if (res.status !== 200) throw new Error(`Download failed (${res.status})`);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri, { dialogTitle: name || 'BCC file' });
  return res.uri;
}

/* ---------- misc ---------- */
export function youtubeId(url) {
  try {
    const u = new URL(url);
    let id = '';
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    if (u.hostname.includes('youtube.com'))
      id =
        u.searchParams.get('v') ||
        (u.pathname.includes('/live/') ? u.pathname.split('/live/')[1] : u.pathname.includes('/embed/') ? u.pathname.split('/embed/')[1] : '');
    return id || '';
  } catch {
    return '';
  }
}

export async function subjectsForClass(classNo) {
  const { data, error } = await sb.from('subjects').select('*').eq('class_no', classNo).order('name');
  if (error) throw error;
  const rows = data || [];
  if (Number(classNo) === 12) {
    const arts = ['History', 'Geography', 'Political Science', 'Economics', 'Hindi', 'Urdu', 'English'];
    return arts.map((n) => rows.find((x) => x.name === n)).filter(Boolean);
  }
  return rows;
}

export function includedAcademicSubjects(exam, record) {
  const subjects = exam?.academic_exam_subjects || [];
  const ids = record?.included_subject_ids;
  if (!Array.isArray(ids) || ids.length === 0) return subjects;
  const set = new Set(ids.map(String));
  return subjects.filter((s) => set.has(String(s.subject_id)));
}
export function academicTotals(exam, record) {
  const subjects = includedAcademicSubjects(exam, record);
  const marks = record?.marks || {};
  const total = subjects.reduce((n, s) => n + Number(marks[s.subject_id] ?? 0), 0);
  const full = subjects.reduce((n, s) => n + Number(s.full_marks || 0), 0);
  return { subjects, total, full, percentage: full ? (total / full) * 100 : null };
}
export const byRoll = (a, b) =>
  String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true, sensitivity: 'base' });

export async function fetchLatestClassQuiz(classNo) {
  const { data, error } = await sb
    .from('quizzes')
    .select('id,title,quiz_type,total_marks,duration_minutes,created_at,start_at,class_no')
    .eq('class_no', classNo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
export async function fetchAcademicExamLeaderboard(examId) {
  const { data, error } = await sb.rpc('get_academic_exam_leaderboard', { p_exam_id: examId });
  if (error) throw error;
  return addPhotoUrls(data || []);
}
export function localDateTimeInput(v) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function parseLocalDateTime(s) {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) throw new Error('Use date format YYYY-MM-DD HH:MM');
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).toISOString();
}

const MEM = new Map(); // screen data cache: key -> last good data
/** Forget everything cached (called on logout so the next user never sees old data). */
export function clearAsyncCache() { MEM.clear(); SIGNED.clear(); }

/**
 * Data-loading hook with "stale-while-revalidate":
 *   const q = useAsync(fn, deps, { key, initial })
 *   - key:     when the screen was visited before, its last data shows INSTANTLY and is refreshed silently in the background
 *   - initial: data that is already known (e.g. the lecture that was tapped) so the page renders with no spinner
 *   q.reload()  = visible reload (pull-to-refresh)       q.refresh() = silent reload (realtime updates)
 */
export function useAsync(fn, deps = [], opts = {}) {
  const key = opts.key;
  const [state, setState] = useState(() => {
    const cached = key ? MEM.get(key) : undefined;
    if (cached !== undefined) return { data: cached, loading: false, error: null };
    if (opts.initial !== undefined && opts.initial !== null) return { data: opts.initial, loading: false, error: null };
    return { data: null, loading: true, error: null };
  });
  const alive = useRef(true);
  const hasData = useRef(state.data !== null);
  hasData.current = state.data !== null;
  const run = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (key) MEM.set(key, data);
      if (alive.current) setState({ data, loading: false, error: null });
    } catch (e) {
      if (alive.current) setState((s) => (silent && s.data !== null ? s : { data: null, loading: false, error: e }));
    }
    // eslint-disable-next-line
  }, deps);
  useEffect(() => {
    alive.current = true;
    run(hasData.current); // something is already on screen -> refresh quietly
    return () => { alive.current = false; };
  }, [run]);
  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);
  return { ...state, reload, refresh };
}

export function timeAgo(v) {
  if (!v) return '';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 1000));
  if (sec < 60) return 'Just now';
  const m = Math.floor(sec / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return fmtDate(v);
}
export function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}
/** true when a Postgres/PostgREST error means "this table does not exist yet" (SQL not run). */
export function isMissingTable(e) {
  const t = `${e?.code || ''} ${e?.message || ''}`;
  return /42P01|PGRST205|PGRST200|does not exist|schema cache/i.test(t);
}

/* ---------- school-local "today" (Asia/Kolkata, UTC+05:30) ---------- */
const OFFSET_MS = SCHOOL_TZ_OFFSET_MIN * 60000;
/** YYYY-MM-DD of a moment in school-local time. */
export const dayKey = (d = new Date()) => new Date(new Date(d).getTime() + OFFSET_MS).toISOString().slice(0, 10);
export const isToday = (v) => !!v && dayKey(v) === dayKey();

/** Re-renders the caller when the school day changes (midnight) and when the app returns to the foreground. */
export function useDayKey() {
  const [k, setK] = useState(dayKey());
  useEffect(() => {
    let t;
    const arm = () => {
      const now = Date.now() + OFFSET_MS;
      const next = (Math.floor(now / 86400000) + 1) * 86400000;
      t = setTimeout(() => { setK(dayKey()); arm(); }, next - now + 1500);
    };
    arm();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setK(dayKey()); });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
  return k;
}

/** Supabase Realtime: call onChange whenever rows of these tables (for this class) change. Cleans up automatically. */
export function useRealtimeTables(tables, classNo, onChange) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',');
  useEffect(() => {
    if (!classNo) return undefined;
    const ch = sb.channel(`rt-${key}-${classNo}-${Math.random().toString(36).slice(2, 7)}`);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `class_no=eq.${classNo}` }, () => cb.current && cb.current()));
    ch.subscribe();
    return () => { try { sb.removeChannel(ch); } catch (_) {} };
  }, [classNo, key]);
}
