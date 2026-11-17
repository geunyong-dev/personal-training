import type { LiveActivity } from 'expo-widgets';

import WorkoutActivity, { type WorkoutActivityProps } from '@/widgets/WorkoutActivity';

let current: LiveActivity<WorkoutActivityProps> | null = null;

function existing(): LiveActivity<WorkoutActivityProps> | null {
  if (current) return current;
  try {
    current = WorkoutActivity.getInstances()[0] ?? null;
  } catch {
    current = null;
  }
  return current;
}

export async function showLiveActivity(props: WorkoutActivityProps): Promise<void> {
  try {
    const live = existing();
    const staleAt = new Date(Date.now() + 4 * 3600 * 1000);
    if (live) await live.update(props, staleAt);
    else current = WorkoutActivity.start(props, 'workoutapp://workout', staleAt);
  } catch {
    // Live Activity가 꺼져 있거나 지원하지 않으면 알림만으로 동작
  }
}

export async function endLiveActivity(): Promise<void> {
  const live = existing();
  current = null;
  try {
    await live?.end('immediate');
  } catch {
    /* noop */
  }
}
