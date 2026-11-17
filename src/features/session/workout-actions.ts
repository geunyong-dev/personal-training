// 운동 진행 화면(오늘의 운동 목록 · 운동 상세)이 함께 쓰는 동작
import { router } from 'expo-router';

import { completedSetCount } from '@/domain/calc';
import { resolveRestSec, validateSet } from '@/domain/rules';
import type { Weekday } from '@/domain/types';
import { ensurePermission } from '@/features/timer/notify';
import { startWorkoutNotice } from '@/features/workout-notice/workout-notice';
import { isTimerRunning, useRestTimer } from '@/features/timer/timer-store';
import { selectActiveSession, useApp } from '@/store/app-store';

import { confirm } from '@/ui/confirm';

import { findExerciseDef, firstUnfinishedIndex, nextSetInfo } from './progress';

export { firstUnfinishedIndex, nextSetInfo } from './progress';

function startRest(restSec: number | null, exIndex: number) {
  const { settings } = useApp.getState();
  if (restSec == null || !settings.autoStartRest) return;
  void useRestTimer
    .getState()
    .start(restSec, nextSetInfo(selectActiveSession(useApp.getState()), settings.unit, exIndex), { sound: settings.restSound });
}

/**
 * 하단 오른쪽 버튼 (요구사항 9)
 * 지금 세트를 완료하고 휴식을 시작한다. 범위 밖 값이면 먼저 확인한다. 완료했으면 true
 */
export async function completeCurrentSet(sessionExerciseId: string): Promise<boolean> {
  const session = selectActiveSession(useApp.getState());
  const exIndex = session?.exercises.findIndex((e) => e.id === sessionExerciseId) ?? -1;
  const ex = session?.exercises[exIndex];
  const target = ex?.sets.find((x) => !x.completedAt);
  if (!ex || !target) return false;
  const v = validateSet(target.weight, target.reps);
  if (!v.ok && !(await confirm('입력값을 확인해 주세요', `${v.reason}. 그래도 저장할까요?`, '저장'))) return false;
  startRest(useApp.getState().completeCurrentSet(sessionExerciseId), exIndex);
  return true;
}

/** [다음 운동]: 마지막 세트를 완료하고 다음 운동 페이지로 (뒤로 가기는 항상 목록으로) */
export async function completeAndGoNext(sessionExerciseId: string): Promise<void> {
  const session = selectActiveSession(useApp.getState());
  const i = session?.exercises.findIndex((e) => e.id === sessionExerciseId) ?? -1;
  const next = session?.exercises[i + 1];
  const hasOpen = session?.exercises[i]?.sets.some((x) => !x.completedAt);
  if (hasOpen && !(await completeCurrentSet(sessionExerciseId))) return;
  if (next) router.replace({ pathname: '/workout/[exerciseId]', params: { exerciseId: next.id } });
}

/** [운동 완료]: 마지막 세트를 완료하고 운동을 끝내 기록을 저장 (요구사항 10) */
export async function completeAndFinish(sessionExerciseId: string): Promise<void> {
  const ex = selectActiveSession(useApp.getState())?.exercises.find((e) => e.id === sessionExerciseId);
  if (ex?.sets.some((x) => !x.completedAt) && !(await completeCurrentSet(sessionExerciseId))) return;
  await finishWorkout();
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
  startRest(useApp.getState().toggleSetComplete(sessionExerciseId, setId), exIndex);
}

/** 하단 "휴식 타이머": 진행 중이면 시트를 다시 열고, 아니면 해당 운동 기준 휴식을 바로 시작 */
export function openRest(exIndex: number): void {
  const timer = useRestTimer.getState();
  if (isTimerRunning(timer)) return timer.showSheet();
  const st = useApp.getState();
  const session = selectActiveSession(st);
  const ex = session?.exercises[exIndex];
  const def = ex ? findExerciseDef(ex.exerciseId) : undefined;
  void timer.start(resolveRestSec(def?.defaultRestSec, ex?.restSec, st.settings), nextSetInfo(session, st.settings.unit, exIndex), {
    sound: st.settings.restSound,
  });
}

/** 운동 끝내기. 남은 세트가 있을 때만 확인을 묻는다 */
export async function finishWorkout(): Promise<void> {
  const session = selectActiveSession(useApp.getState());
  if (!session) return;
  const done = completedSetCount(session);
  const left = session.exercises.reduce((a, e) => a + e.sets.filter((x) => !x.completedAt).length, 0);
  if (done === 0 || left > 0) {
    const ok = await confirm(
      '운동을 마칠까요?',
      done === 0 ? '완료한 세트가 없어서 이 세션은 저장되지 않아요.' : `남은 세트 ${left}개는 빼고, 완료한 ${done}세트를 저장해요.`,
      '마치기',
    );
    if (!ok) return;
  }
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

/**
 * 오늘의 운동 시작 (요구사항 6)
 * 계획으로 세션을 만들고 → 오늘의 운동 목록 → 첫 번째 운동 상세로 바로 들어간다. 전체 타이머는 시작 시각부터 흐른다.
 */
export function startTodayWorkout(day: Weekday): boolean {
  const st = useApp.getState();
  const existing = selectActiveSession(st);
  const id = existing?.id ?? st.startSessionFromPlan(day);
  if (!id) return false;
  void ensurePermission();
  const session = selectActiveSession(useApp.getState());
  void startWorkoutNotice();
  const first = session ? session.exercises[firstUnfinishedIndex(session)] : undefined;
  if (first) router.navigate({ pathname: '/workout/[exerciseId]', params: { exerciseId: first.id } });
  else router.navigate('/workout');
  return true;
}
