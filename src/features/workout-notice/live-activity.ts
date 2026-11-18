// iOS 외: Live Activity 없음 (Android는 고정 알림으로 대신)
import type { WorkoutActivityProps } from '@/widgets/WorkoutActivity';

export async function showLiveActivity(_props: WorkoutActivityProps): Promise<void> {}
export async function endLiveActivity(): Promise<void> {}
