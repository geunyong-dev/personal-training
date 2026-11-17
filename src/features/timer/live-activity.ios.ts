import type { LiveActivity } from 'expo-widgets';

import RestTimerActivity, { type RestTimerProps } from '@/widgets/RestTimerActivity';

let current: LiveActivity<RestTimerProps> | null = null;

function existing(): LiveActivity<RestTimerProps> | null {
  if (current) return current;
  try {
    current = RestTimerActivity.getInstances()[0] ?? null;
  } catch {
    current = null;
  }
  return current;
}

export async function showRestActivity(props: RestTimerProps): Promise<void> {
  try {
    const live = existing();
    if (live) {
      await live.update(props, new Date(props.endMs + 60_000));
    } else {
      current = RestTimerActivity.start(props, 'workoutapp://workout', new Date(props.endMs + 60_000));
    }
  } catch {
    // Live Activity가 꺼져 있거나 지원하지 않는 기기면 알림만으로 동작한다
  }
}

export async function endRestActivity(): Promise<void> {
  const live = existing();
  current = null;
  try {
    await live?.end('immediate');
  } catch {
    /* noop */
  }
}
