// 운동 진행 중 상시 알림 (요구사항 7)
// - Android: 지울 수 없는 고정(sticky) 알림. 앱을 꺼도 알림창에 남는다
// - iOS: Live Activity (잠금화면·Dynamic Island). 시스템이 시계를 직접 그리므로 앱을 꺼도 계속 흐른다
// 시간은 모두 "시작 시각" 기준으로 계산하므로 앱이 꺼져 있어도 다시 켰을 때 그대로 이어진다.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatWeight } from '@/domain/rules';
import { firstUnfinishedIndex } from '@/features/session/progress';
import { WORKOUT_CHANNEL } from '@/features/timer/notify';
import { useRestTimer } from '@/features/timer/timer-store';
import { findExercise, selectActiveSession, useApp } from '@/store/app-store';

import { endLiveActivity, showLiveActivity } from './live-activity';

const NOTICE_ID = 'workout-ongoing';

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function snapshot() {
  const st = useApp.getState();
  const session = selectActiveSession(st);
  if (!session) return null;
  const idx = firstUnfinishedIndex(session);
  const ex = session.exercises[idx];
  const def = ex ? findExercise(st, ex.exerciseId) : undefined;
  const done = ex ? ex.sets.filter((s) => s.completedAt).length : 0;
  const next = ex?.sets.find((s) => !s.completedAt);
  const setLabel = ex
    ? `${Math.min(done + 1, ex.sets.length)}/${ex.sets.length}세트${next ? ` · ${next.weight ? `${formatWeight(next.weight, st.settings.unit)} × ` : ''}${next.reps}회` : ''}`
    : '';
  const t = useRestTimer.getState();
  return {
    title: `오늘의 운동${session.title ? ` · ${session.title}` : ''}`,
    startMs: Date.parse(session.startedAt),
    exerciseName: def?.nameKo ?? '운동',
    setLabel,
    rest: t.endsAt
      ? { startMs: t.startMs ?? Date.now(), endMs: t.endsAt }
      : t.pausedRemainingMs != null
        ? { startMs: Date.now() - (t.totalSec * 1000 - t.pausedRemainingMs), endMs: Date.now() + t.pausedRemainingMs, pausedAtMs: Date.now() }
        : undefined,
  };
}

let lastKey = '';

/** 진행 중 세션이 있으면 알림을 띄우거나 갱신하고, 없으면 내린다 */
export async function syncWorkoutNotice(): Promise<void> {
  if (Platform.OS === 'web') return;
  const s = snapshot();
  if (!s) return endWorkoutNotice();
  const key = JSON.stringify([s.exerciseName, s.setLabel, s.rest?.endMs, s.rest && 'pausedAtMs' in s.rest]);
  if (key === lastKey) return;
  lastKey = key;

  if (Platform.OS === 'ios') {
    await showLiveActivity({
      title: s.title,
      startMs: s.startMs,
      exerciseName: s.exerciseName,
      setLabel: s.setLabel,
      restStartMs: s.rest?.startMs,
      restEndMs: s.rest?.endMs,
      restPausedAtMs: s.rest && 'pausedAtMs' in s.rest ? s.rest.pausedAtMs : undefined,
    });
    return;
  }

  // Android: 같은 identifier로 다시 띄우면 제자리에서 바뀐다
  const restLine = s.rest ? ` · 휴식 ${hhmmss(s.rest.endMs)}까지` : '';
  await Notifications.scheduleNotificationAsync({
    identifier: NOTICE_ID,
    content: {
      title: `${s.title} · ${hhmm(s.startMs)} 시작`,
      body: `${s.exerciseName} ${s.setLabel}${restLine}`,
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      data: { kind: 'workout-ongoing', url: '/workout' },
    },
    trigger: { channelId: WORKOUT_CHANNEL },
  });
}

export async function startWorkoutNotice(): Promise<void> {
  lastKey = '';
  await syncWorkoutNotice();
}

export async function endWorkoutNotice(): Promise<void> {
  if (lastKey === 'ended') return;
  lastKey = 'ended';
  if (Platform.OS === 'ios') return endLiveActivity();
  if (Platform.OS === 'android') await Notifications.dismissNotificationAsync(NOTICE_ID).catch(() => undefined);
}

/** 세션·휴식 타이머가 바뀔 때마다 알림을 맞춘다 (루트 레이아웃에서 한 번 호출) */
export function watchWorkoutNotice(): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => void syncWorkoutNotice(), 300);
  };
  const a = useApp.subscribe((n, p) => n.sessions !== p.sessions && schedule());
  const b = useRestTimer.subscribe((n, p) => (n.endsAt !== p.endsAt || n.pausedRemainingMs !== p.pausedRemainingMs) && schedule());
  schedule();
  return () => {
    a();
    b();
    if (t) clearTimeout(t);
  };
}
