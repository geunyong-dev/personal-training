// iOS 외 플랫폼: Live Activity 없음. Android는 예약 알림(5.3)으로 대신한다.
// TODO(2차): expo-widgets CustomNotification(jetpack-compose)으로 Android 진행 알림 카운트다운 구현
import type { RestTimerProps } from '@/widgets/RestTimerActivity';

export async function showRestActivity(_props: RestTimerProps): Promise<void> {}
export async function endRestActivity(): Promise<void> {}
