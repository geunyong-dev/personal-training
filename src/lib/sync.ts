// 기기 ↔ Supabase 동기화 (정의서 5.2 오프라인 우선)
// 1) 기기에 먼저 저장  2) 마지막 동기화 이후 바뀐 것만 올림  3) 서버에서 바뀐 것을 내려받아 병합
// 충돌: 마지막 수정 시각 우선(LWW). 서버 트리거도 같은 규칙으로 오래된 갱신을 무시한다.
import type { Exercise, PersonalRecord, Profile, Routine, Session } from '@/domain/types';
import { useApp } from '@/store/app-store';

import { checkClaudeConnected, currentUserId, supabase } from './supabase';

// ---- 매핑 (앱 camelCase ↔ DB snake_case) ----
export const toRow = {
  routine: (r: Routine) => ({
    id: r.id,
    name: r.name,
    source: r.source,
    status: r.status,
    items: r.items,
    note: r.note ?? null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }),
  session: (s: Session) => ({
    id: s.id,
    routine_id: s.routineId ?? null,
    started_at: s.startedAt,
    ended_at: s.endedAt ?? null,
    end_reason: s.endReason ?? null,
    memo: s.memo ?? null,
    exercises: s.exercises,
    updated_at: s.updatedAt,
  }),
  pr: (p: PersonalRecord) => ({
    exercise_id: p.exerciseId,
    type: p.type,
    value: p.value,
    session_id: p.sessionId,
    set_id: p.setId ?? null,
    achieved_at: p.achievedAt,
  }),
  exercise: (e: Exercise & { updatedAt?: string }) => ({
    id: e.id,
    name_ko: e.nameKo,
    name_en: e.nameEn,
    body_parts: e.bodyParts,
    equipment: e.equipment,
    type: e.type,
    default_rest_sec: e.defaultRestSec ?? null,
  }),
  profile: (p: Profile, s: { unit: string; defaultRestSec: number }) => ({
    nickname: p.nickname,
    goal: p.goal,
    level: p.level,
    weekly_freq: p.weeklyFreq,
    equipment: p.equipment,
    consent_body: p.consentBody,
    height_cm: p.consentBody ? (p.heightCm ?? null) : null,
    weight_kg: p.consentBody ? (p.weightKg ?? null) : null,
    unit: s.unit,
    default_rest_sec: s.defaultRestSec,
  }),
};

type Row = Record<string, any>;

export const fromRow = {
  routine: (r: Row): Routine => ({
    id: r.id,
    name: r.name,
    source: r.source,
    status: r.status,
    items: r.items ?? [],
    note: r.note ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  session: (r: Row): Session => ({
    id: r.id,
    routineId: r.routine_id ?? undefined,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    endReason: r.end_reason ?? undefined,
    memo: r.memo ?? undefined,
    exercises: r.exercises ?? [],
    updatedAt: r.updated_at,
  }),
  pr: (r: Row): PersonalRecord => ({
    exerciseId: r.exercise_id,
    type: r.type,
    value: Number(r.value),
    sessionId: r.session_id,
    setId: r.set_id ?? undefined,
    achievedAt: r.achieved_at,
  }),
  exercise: (r: Row): Exercise => ({
    id: r.id,
    nameKo: r.name_ko,
    nameEn: r.name_en,
    bodyParts: r.body_parts,
    equipment: r.equipment,
    type: r.type,
    defaultRestSec: r.default_rest_sec ?? undefined,
    isCustom: true,
  }),
  profile: (r: Row): Profile => ({
    nickname: r.nickname,
    goal: r.goal,
    level: r.level,
    weeklyFreq: r.weekly_freq,
    equipment: r.equipment,
    consentBody: r.consent_body,
    heightCm: r.height_cm ?? undefined,
    weightKg: r.weight_kg ?? undefined,
  }),
};

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<void> {
  if (!(await currentUserId())) return;
  const st = useApp.getState();
  const since = st.lastSyncedAt ?? '1970-01-01T00:00:00Z';
  const startedAt = new Date().toISOString();
  const changed = <T extends { updatedAt: string }>(xs: T[]) => xs.filter((x) => x.updatedAt > since);

  // ---- push ----
  if (st.profile) {
    const { error } = await supabase.from('profiles').upsert(toRow.profile(st.profile, st.settings), { onConflict: 'user_id' });
    if (error) throw error;
  }
  const routines = changed(st.routines);
  if (routines.length) await must(supabase.from('routines').upsert(routines.map(toRow.routine)));
  // 진행 중 세션은 끝난 뒤에 올린다
  const sessions = changed(st.sessions.filter((s) => !!s.endedAt));
  if (sessions.length) await must(supabase.from('sessions').upsert(sessions.map(toRow.session)));
  if (st.customExercises.length) await must(supabase.from('custom_exercises').upsert(st.customExercises.map(toRow.exercise)));
  if (st.prs.length) await must(supabase.from('personal_records').upsert(st.prs.map(toRow.pr), { onConflict: 'user_id,exercise_id,type' }));
  for (const t of st.tombstones) {
    await must(supabase.from(t.table === 'exercises' ? 'custom_exercises' : t.table).delete().eq('id', t.id));
  }

  // ---- pull ----
  const [r, s, p, e, prof] = await Promise.all([
    supabase.from('routines').select('*').gt('updated_at', since),
    supabase.from('sessions').select('*').gt('updated_at', since),
    supabase.from('personal_records').select('*'),
    supabase.from('custom_exercises').select('*'),
    supabase.from('profiles').select('*').maybeSingle(),
  ]);
  useApp.getState().applyRemote({
    routines: r.data?.map(fromRow.routine),
    sessions: s.data?.map(fromRow.session),
    prs: p.data?.map(fromRow.pr),
    customExercises: e.data?.map(fromRow.exercise),
    profile: prof.data ? fromRow.profile(prof.data) : undefined,
  });
  useApp.getState().markSynced(startedAt);
  useApp.getState().setClaudeConnected(await checkClaudeConnected());
}

async function must(q: PromiseLike<{ error: unknown }>) {
  const { error } = await q;
  if (error) throw error;
}

/** 앱 실행 중 주기적 동기화 + 세션 종료·루틴 변경 시 즉시 동기화 */
export function startSyncLoop(intervalMs = 60_000): () => void {
  const tick = () => void syncNow().catch(() => undefined);
  const id = setInterval(tick, intervalMs);
  let prev = useApp.getState();
  const unsub = useApp.subscribe((next) => {
    if (next.routines !== prev.routines || next.sessions.filter((x) => x.endedAt).length !== prev.sessions.filter((x) => x.endedAt).length) {
      setTimeout(tick, 1500);
    }
    prev = next;
  });
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') tick();
  });
  tick();
  return () => {
    clearInterval(id);
    unsub();
    data.subscription.unsubscribe();
  };
}
