// MCP 도구가 쓰는 순수 계산 함수 (앱의 src/domain/calc.ts 규칙과 동일하게 유지)

export type DbSet = {
  id: string;
  kind: 'normal' | 'warmup' | 'drop' | 'failure';
  weight: number;
  reps: number;
  rpe?: number;
  completedAt?: string;
  restActualSec?: number;
};
export type DbSessionExercise = { id: string; exerciseId: string; sets: DbSet[] };
export type DbSession = {
  id: string;
  routine_id: string | null;
  started_at: string;
  ended_at: string | null;
  memo: string | null;
  exercises: DbSessionExercise[];
};
export type ExerciseInfo = { id: string; name_ko: string; body_parts: string[] };

const counts = (s: DbSet) => !!s.completedAt && s.kind !== 'warmup';

export function volume(sets: DbSet[]): number {
  return sets.filter(counts).reduce((a, s) => a + s.weight * s.reps, 0);
}

export function e1rm(weight: number, reps: number): number | null {
  if (weight <= 0 || reps < 1 || reps > 10) return null;
  return Math.round(weight * (1 + (reps === 1 ? 0 : reps / 30)) * 10) / 10;
}

/** Claude가 읽기 좋은 세션 요약 */
export function summarizeSession(s: DbSession, names: Map<string, ExerciseInfo>) {
  return {
    id: s.id,
    date: s.started_at,
    duration_min: s.ended_at ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000) : null,
    total_volume_kg: s.exercises.reduce((a, e) => a + volume(e.sets), 0),
    memo: s.memo,
    exercises: s.exercises.map((e) => ({
      exercise_id: e.exerciseId,
      name: names.get(e.exerciseId)?.name_ko ?? e.exerciseId,
      sets: e.sets.map((x) => ({
        kind: x.kind,
        weight_kg: x.weight,
        reps: x.reps,
        ...(x.rpe != null ? { rpe: x.rpe } : {}),
        ...(x.restActualSec != null ? { rest_sec: x.restActualSec } : {}),
      })),
    })),
  };
}

/** 부위별 마지막 운동 이후 경과 시간과 회복도(72시간 = 100%) */
export function recovery(sessions: DbSession[], names: Map<string, ExerciseInfo>, now = Date.now()) {
  const last: Record<string, number> = {};
  for (const s of sessions) {
    const t = Date.parse(s.ended_at ?? s.started_at);
    for (const e of s.exercises) {
      if (!e.sets.some(counts)) continue;
      for (const p of names.get(e.exerciseId)?.body_parts ?? []) last[p] = Math.max(last[p] ?? 0, t);
    }
  }
  return Object.entries(last)
    .map(([body_part, t]) => {
      const hours = Math.round((now - t) / 3600e3);
      return { body_part, hours_since_trained: hours, recovery_pct: Math.min(100, Math.round((hours / 72) * 100)) };
    })
    .sort((a, b) => a.recovery_pct - b.recovery_pct);
}

export function weeksAgoIso(weeks: number, now = Date.now()): string {
  return new Date(now - weeks * 7 * 86400e3).toISOString();
}
