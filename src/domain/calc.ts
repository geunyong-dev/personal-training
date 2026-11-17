// 볼륨·PR·요약 계산 (정의서 5.2)
import type { Exercise, PersonalRecord, PRType, Session, WorkoutSet } from './types';

/** 볼륨·PR 계산에 넣는 세트: 완료됐고 웜업이 아닌 세트 */
export function countsTowardStats(set: WorkoutSet): boolean {
  return !!set.completedAt && set.kind !== 'warmup';
}

/** Epley 추정 1RM. 횟수 10 이하만 유효, 그 외 null */
export function estimate1RM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps < 1 || reps > 10) return null;
  if (reps === 1) return weight;
  return round1(weight * (1 + reps / 30));
}

export function setVolume(set: WorkoutSet): number {
  return set.weight * set.reps;
}

export function exerciseVolume(sets: WorkoutSet[]): number {
  return sets.filter(countsTowardStats).reduce((sum, s) => sum + setVolume(s), 0);
}

export function sessionVolume(session: Session): number {
  return session.exercises.reduce((sum, e) => sum + exerciseVolume(e.sets), 0);
}

export function completedSetCount(session: Session): number {
  return session.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => !!s.completedAt).length,
    0,
  );
}

export function sessionDurationSec(session: Session): number {
  if (!session.endedAt) return 0;
  return Math.max(
    0,
    Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000),
  );
}

/** 한 세션의 운동별 최고값 (PR 후보) */
export function sessionBests(
  session: Session,
): { exerciseId: string; type: PRType; value: number; setId?: string }[] {
  const out: { exerciseId: string; type: PRType; value: number; setId?: string }[] = [];
  for (const ex of session.exercises) {
    const sets = ex.sets.filter(countsTowardStats);
    if (sets.length === 0) continue;
    let maxW: WorkoutSet | undefined;
    let maxE: { set: WorkoutSet; v: number } | undefined;
    for (const s of sets) {
      if (s.weight > 0 && (!maxW || s.weight > maxW.weight)) maxW = s;
      const e = estimate1RM(s.weight, s.reps);
      if (e !== null && (!maxE || e > maxE.v)) maxE = { set: s, v: e };
    }
    if (maxW) out.push({ exerciseId: ex.exerciseId, type: 'max_weight', value: maxW.weight, setId: maxW.id });
    if (maxE) out.push({ exerciseId: ex.exerciseId, type: 'e1rm', value: maxE.v, setId: maxE.set.id });
    const vol = exerciseVolume(ex.sets);
    if (vol > 0) out.push({ exerciseId: ex.exerciseId, type: 'volume', value: vol });
  }
  return out;
}

/**
 * 세션 종료 시 PR 갱신 판정.
 * 기존 기록보다 "엄격히 큰" 값만 새 PR. 첫 기록도 PR로 친다.
 */
export function detectNewPRs(
  session: Session,
  existing: PersonalRecord[],
): PersonalRecord[] {
  const achievedAt = session.endedAt ?? session.updatedAt;
  const fresh: PersonalRecord[] = [];
  for (const b of sessionBests(session)) {
    const prev = existing.find((p) => p.exerciseId === b.exerciseId && p.type === b.type);
    if (!prev || b.value > prev.value) {
      fresh.push({ ...b, sessionId: session.id, achievedAt });
    }
  }
  return fresh;
}

export function mergePRs(existing: PersonalRecord[], fresh: PersonalRecord[]): PersonalRecord[] {
  const key = (p: PersonalRecord) => `${p.exerciseId}:${p.type}`;
  const map = new Map(existing.map((p) => [key(p), p]));
  for (const p of fresh) map.set(key(p), p);
  return [...map.values()];
}

/** 같은 운동의 가장 최근 완료 세트들 (직전 기록 자동 채움 힌트, 5.2) */
export function lastSetsFor(
  exerciseId: string,
  sessions: Session[],
  excludeSessionId?: string,
): WorkoutSet[] {
  const sorted = [...sessions]
    .filter((s) => s.id !== excludeSessionId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const s of sorted) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    const done = ex?.sets.filter((x) => !!x.completedAt) ?? [];
    if (done.length) return done;
  }
  return [];
}

/** ISO 주 시작(월요일, 로컬) */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

/**
 * 과훈련 주의 (5.8): 이번 주 볼륨이 직전 4주 평균보다 30% 이상 많으면 true.
 * 직전 4주에 기록이 하나도 없으면 판단하지 않는다.
 */
export function overloadWarning(sessions: Session[], now = new Date()): boolean {
  const thisWeek = weekStart(now).getTime();
  const week = 7 * 86400e3;
  const buckets = [0, 0, 0, 0, 0]; // 0 = 이번 주, 1~4 = 직전 주들
  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    const idx = t >= thisWeek ? 0 : Math.floor((thisWeek - t) / week) + 1;
    if (idx >= 0 && idx <= 4) buckets[idx] += sessionVolume(s);
  }
  const prev = buckets.slice(1);
  if (prev.every((v) => v === 0)) return false;
  const avg = prev.reduce((a, b) => a + b, 0) / 4;
  return avg > 0 && buckets[0] >= avg * 1.3;
}

/** 부위별 마지막 운동 이후 경과 시간으로 본 단순 회복도 0~100 */
export function recoveryByBodyPart(
  sessions: Session[],
  exercises: Exercise[],
  now = Date.now(),
): Record<string, number> {
  const lastHit: Record<string, number> = {};
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const s of sessions) {
    const t = Date.parse(s.endedAt ?? s.startedAt);
    for (const ex of s.exercises) {
      if (!ex.sets.some(countsTowardStats)) continue;
      for (const part of byId.get(ex.exerciseId)?.bodyParts ?? []) {
        lastHit[part] = Math.max(lastHit[part] ?? 0, t);
      }
    }
  }
  const FULL_HOURS = 72;
  const out: Record<string, number> = {};
  for (const [part, t] of Object.entries(lastHit)) {
    const h = (now - t) / 3600e3;
    out[part] = Math.max(0, Math.min(100, Math.round((h / FULL_HOURS) * 100)));
  }
  return out;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
