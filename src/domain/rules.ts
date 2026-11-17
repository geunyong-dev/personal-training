// 입력 범위·휴식 시간·자동 종료 규칙 (정의서 5.2, 5.3)
import type { Session, SessionExercise, Settings, Unit, WorkoutSet } from './types';

export const LIMITS = {
  weightMaxKg: 500,
  weightStep: 0.25,
  repsMin: 1,
  repsMax: 100,
  setsPerExerciseMax: 30,
  restMinSec: 10,
  restMaxSec: 600,
  restAdjustSec: 15,
  restWarnBeforeEndSec: 10,
  autoCloseHours: 3,
  nicknameMin: 2,
  nicknameMax: 12,
  minAge: 14,
} as const;

const LB_PER_KG = 2.2046226218;

export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function formatWeight(kg: number, unit: Unit): string {
  const v = fromKg(kg, unit);
  const rounded = Math.round(v * 100) / 100;
  return `${rounded}${unit}`;
}

/** 0.25kg 단위로 반올림 */
export function snapWeight(kg: number): number {
  return Math.round(kg / LIMITS.weightStep) * LIMITS.weightStep;
}

export type SetValidation = { ok: true } | { ok: false; needsConfirm: true; reason: string };

/** 범위 밖 값은 막지 않고 "저장 전 확인"을 요구한다 (5.2) */
export function validateSet(weightKg: number, reps: number): SetValidation {
  if (weightKg < 0 || weightKg > LIMITS.weightMaxKg) {
    return { ok: false, needsConfirm: true, reason: `무게가 ${LIMITS.weightMaxKg}kg 범위를 벗어났어요` };
  }
  if (reps < LIMITS.repsMin || reps > LIMITS.repsMax) {
    return { ok: false, needsConfirm: true, reason: `횟수가 ${LIMITS.repsMin}~${LIMITS.repsMax} 범위를 벗어났어요` };
  }
  return { ok: true };
}

export function canAddSet(ex: SessionExercise): boolean {
  return ex.sets.length < LIMITS.setsPerExerciseMax;
}

export function clampRest(sec: number): number {
  return Math.min(LIMITS.restMaxSec, Math.max(LIMITS.restMinSec, Math.round(sec)));
}

/** 휴식 시간 우선순위: 운동별 설정 > 루틴 설정 > 전역 기본값 (5.3) */
export function resolveRestSec(
  exerciseDefault: number | undefined,
  routineRest: number | undefined,
  settings: Pick<Settings, 'defaultRestSec'>,
): number {
  return clampRest(exerciseDefault ?? routineRest ?? settings.defaultRestSec);
}

export function lastActivityAt(session: Session): number {
  let t = Date.parse(session.startedAt);
  for (const ex of session.exercises) {
    for (const s of ex.sets) {
      if (s.completedAt) t = Math.max(t, Date.parse(s.completedAt));
    }
  }
  return Math.max(t, Date.parse(session.updatedAt));
}

/** 마지막 입력 후 3시간 무활동이면 자동 종료 대상 */
export function shouldAutoClose(session: Session, now = Date.now()): boolean {
  if (session.endedAt) return false;
  return now - lastActivityAt(session) >= LIMITS.autoCloseHours * 3600e3;
}

/** 완료 세트가 0개면 저장하지 않는다 */
export function isSavable(session: Session): boolean {
  return session.exercises.some((e) => e.sets.some((s: WorkoutSet) => !!s.completedAt));
}

/** 미래 날짜 기록 불가 */
export function isFutureDate(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) > now + 60_000;
}

export function validateNickname(name: string): string | null {
  const n = name.trim();
  if (n.length < LIMITS.nicknameMin || n.length > LIMITS.nicknameMax) {
    return `닉네임은 ${LIMITS.nicknameMin}~${LIMITS.nicknameMax}자로 입력해 주세요`;
  }
  if (!/^[가-힣A-Za-z0-9_]+$/.test(n)) return '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요';
  return null;
}
