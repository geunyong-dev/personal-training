// 진행 중 세션에서 "지금 할 것"을 찾는 순수 헬퍼 (알림·화면 공용)
import { formatWeight } from '@/domain/rules';
import type { Session, Unit } from '@/domain/types';
import { findExercise, useApp } from '@/store/app-store';

export const findExerciseDef = (id: string) => findExercise(useApp.getState(), id);

/** 다음에 할 세트 안내: 지정한 운동의 남은 세트 → 그 뒤 운동 → 앞쪽 운동 순 */
export function nextSetInfo(session: Session | undefined, unit: Unit, fromIndex = 0) {
  const ex = session?.exercises ?? [];
  const order = [...ex.slice(fromIndex), ...ex.slice(0, fromIndex)];
  const next = order.flatMap((e) => e.sets.map((x, i) => ({ e, x, i }))).find(({ x }) => !x.completedAt);
  const def = next ? findExercise(useApp.getState(), next.e.exerciseId) : undefined;
  return {
    exerciseName: def?.nameKo ?? '운동',
    nextSetLabel: next
      ? `${next.i + 1}세트 · ${next.x.weight ? `${formatWeight(next.x.weight, unit)} × ` : ''}${next.x.reps}회`
      : '마지막 세트 완료',
  };
}

export function firstUnfinishedIndex(session: Session): number {
  const i = session.exercises.findIndex((e) => e.sets.some((x) => !x.completedAt));
  return i === -1 ? Math.max(0, session.exercises.length - 1) : i;
}

