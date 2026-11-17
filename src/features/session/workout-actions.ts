// 운동 진행 화면(오늘의 운동 목록 · 운동 상세)이 함께 쓰는 동작
import { router } from 'expo-router';

import { completedSetCount } from '@/domain/calc';
import { formatWeight, resolveRestSec, validateSet } from '@/domain/rules';
import type { Session, Unit } from '@/domain/types';
import { isTimerRunning, useRestTimer } from '@/features/timer/timer-store';
import { findExercise, selectActiveSession, useApp } from '@/store/app-store';
import { confirm } from '@/ui/confirm';

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

/** 세트 완료 토글. 완료로 바뀌면 휴식 타이머를 시작해 바텀시트를 올린다 */
export async function toggleSet(sessionExerciseId: string, setId: string): Promise<void> {
  const st = useApp.getState();
  const session = selectActiveSession(st);
  const exIndex = session?.exercises.findIndex((e) => e.id === sessionExerciseId) ?? -1;
  const target = session?.exercises[exIndex]?.sets.find((s) => s.id === setId);
  if (!session || !target) return;
  if (!target.completedAt) {
    const v = validateSet(target.weight, target.reps);
    if (!v.ok && !(await confirm('입력값을 확인해 주세요', `${v.reason}. 그래도 저장할까요?`, '저장'))) return;
  }
  const restSec = useApp.getState().toggleSetComplete(sessionExerciseId, setId);
  const { settings } = useApp.getState();
  if (restSec == null || !settings.autoStartRest) return;
  void useRestTimer
    .getState()
    .start(restSec, nextSetInfo(selectActiveSession(useApp.getState()), settings.unit, exIndex), { sound: settings.restSound });
}

/** 하단 "휴식 타이머": 진행 중이면 시트를 다시 열고, 아니면 해당 운동 기준 휴식을 바로 시작 */
export function openRest(exIndex: number): void {
  const timer = useRestTimer.getState();
  if (isTimerRunning(timer)) return timer.showSheet();
  const st = useApp.getState();
  const session = selectActiveSession(st);
  const ex = session?.exercises[exIndex];
  const def = ex ? findExercise(st, ex.exerciseId) : undefined;
  void timer.start(resolveRestSec(def?.defaultRestSec, ex?.restSec, st.settings), nextSetInfo(session, st.settings.unit, exIndex), {
    sound: st.settings.restSound,
  });
}

export async function finishWorkout(): Promise<void> {
  const session = selectActiveSession(useApp.getState());
  if (!session) return;
  const done = completedSetCount(session);
  const ok = await confirm(
    '운동을 마칠까요?',
    done === 0 ? '완료한 세트가 없어서 이 세션은 저장되지 않아요.' : `완료한 세트 ${done}개를 저장해요. 미완료 세트는 빠져요.`,
    '마치기',
  );
  if (!ok) return;
  void useRestTimer.getState().skip();
  const res = useApp.getState().finishSession('manual');
  if (router.canDismiss()) router.dismissAll(); // 운동 상세에서 끝냈으면 오늘의 운동으로 되돌린다
  if (res.saved) router.push({ pathname: '/session/[id]', params: { id: res.sessionId, fresh: '1' } });
}

export async function discardWorkout(): Promise<void> {
  if (await confirm('세션을 버릴까요?', '이 세션의 기록이 모두 지워져요.', '버리기', true)) {
    void useRestTimer.getState().skip();
    useApp.getState().discardActiveSession();
  }
}
