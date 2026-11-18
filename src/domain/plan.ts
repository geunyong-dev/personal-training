// 주간 계획과 운동 진행 규칙
import { LIMITS } from './rules';
import type { DayPlan, PlanItem, Session, SessionExercise, Weekday } from './types';

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_KO = ['월', '화', '수', '목', '금', '토', '일'] as const;
export const WEEKDAY_EN = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** JS Date의 요일(일=0)을 계획 요일(월=0)로 */
export function weekdayOf(d: Date = new Date()): Weekday {
  return ((d.getDay() + 6) % 7) as Weekday;
}

export function parseWeekday(v: string | number | undefined): Weekday | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : WEEKDAY_EN.indexOf(v as (typeof WEEKDAY_EN)[number]);
  const k = n >= 0 ? n : Number(v);
  return Number.isInteger(k) && k >= 0 && k <= 6 ? (k as Weekday) : null;
}

export function validatePlanItem(i: PlanItem): string | null {
  if (!Number.isInteger(i.sets) || i.sets < 1 || i.sets > LIMITS.setsPerExerciseMax) return `세트는 1~${LIMITS.setsPerExerciseMax}개`;
  if (!Number.isInteger(i.reps) || i.reps < LIMITS.repsMin || i.reps > LIMITS.repsMax) return `횟수는 ${LIMITS.repsMin}~${LIMITS.repsMax}회`;
  if (i.weightKg != null && (i.weightKg < 0 || i.weightKg > LIMITS.weightMaxKg)) return `무게는 0~${LIMITS.weightMaxKg}kg`;
  return null;
}

export function planSetCount(p: DayPlan | undefined): number {
  return p?.items.reduce((a, i) => a + i.sets, 0) ?? 0;
}

/** 요일 계획으로 오늘의 세션을 만든다 */
export function sessionFromPlan(plan: DayPlan, day: Weekday, makeId: () => string, now = new Date()): Session {
  const iso = now.toISOString();
  return {
    id: makeId(),
    planDay: day,
    title: plan.title,
    startedAt: iso,
    updatedAt: iso,
    exercises: plan.items.map((it) => ({
      id: makeId(),
      exerciseId: it.exerciseId,
      restSec: it.restSec,
      sets: Array.from({ length: it.sets }, () => ({
        id: makeId(),
        kind: 'normal' as const,
        weight: it.weightKg ?? 0,
        reps: it.reps,
      })),
    })),
  };
}

/** 지금 할 세트 = 첫 미완료 세트. 모두 끝났으면 -1 */
export function currentSetIndex(ex: SessionExercise): number {
  return ex.sets.findIndex((s) => !s.completedAt);
}

export type FooterAction = 'complete_set' | 'next_exercise' | 'finish';

/**
 * 운동 상세 하단 오른쪽 버튼 (요구사항 9)
 * - 남은 세트가 2개 이상: 세트 완료
 * - 남은 세트가 1개(마지막 세트)이거나 다 끝남: 다음 운동, 마지막 운동이면 운동 완료
 */
export function footerAction(session: Session, exIndex: number): FooterAction {
  const ex = session.exercises[exIndex];
  const remaining = ex ? ex.sets.filter((s) => !s.completedAt).length : 0;
  if (remaining >= 2) return 'complete_set';
  return exIndex >= session.exercises.length - 1 ? 'finish' : 'next_exercise';
}

export const FOOTER_LABEL: Record<FooterAction, string> = {
  complete_set: '세트 완료',
  next_exercise: '다음 운동',
  finish: '운동 완료',
};
