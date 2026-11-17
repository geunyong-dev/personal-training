// 휴식 타이머 로컬 알림 (정의서 5.3)
// 종료 시각 기준으로 예약해 두므로 앱이 백그라운드이거나 종료돼도 알림이 울린다.
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

export const REST_CHANNEL = 'rest-timer';
export const REST_WARN_CHANNEL = 'rest-timer-warn';
export const WORKOUT_CHANNEL = 'workout-ongoing';

let initialized = false;

export async function initNotifications(): Promise<void> {
  if (initialized || Platform.OS === 'web') return;
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      // 앱이 켜져 있으면 화면 안의 타이머가 보이므로 경고 알림은 배너를 띄우지 않는다
      const kind = n.request.content.data?.kind;
      const isWarn = kind === 'rest-warn' || kind === 'workout-ongoing';
      return {
        shouldShowBanner: !isWarn,
        shouldShowList: !isWarn,
        shouldPlaySound: !isWarn,
        shouldSetBadge: false,
      };
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
      name: '휴식 타이머 종료',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(WORKOUT_CHANNEL, {
      name: '운동 진행 중',
      importance: AndroidImportance.LOW, // 소리·진동 없이 알림창에 상시 표시
      vibrationPattern: null,
      sound: null,
    });
    await Notifications.setNotificationChannelAsync(REST_WARN_CHANNEL, {
      name: '휴식 종료 10초 전',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200],
      sound: null,
    });
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return req.granted;
}

export type ScheduledIds = { end?: string; warn?: string };

export async function scheduleRestNotifications(
  endsAt: number,
  label: string,
  opts: { sound: boolean; warnBeforeSec: number },
): Promise<ScheduledIds> {
  if (Platform.OS === 'web') return {};
  const ids: ScheduledIds = {};
  ids.end = await Notifications.scheduleNotificationAsync({
    content: {
      title: '휴식 끝! 다음 세트 시작하세요',
      body: label,
      sound: opts.sound ? 'default' : undefined,
      data: { kind: 'rest-end', url: '/workout' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: endsAt,
      channelId: REST_CHANNEL,
    },
  });
  const warnAt = endsAt - opts.warnBeforeSec * 1000;
  if (warnAt > Date.now() + 1000) {
    ids.warn = await Notifications.scheduleNotificationAsync({
      content: {
        title: `휴식 ${opts.warnBeforeSec}초 남음`,
        body: label,
        data: { kind: 'rest-warn', url: '/workout' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: warnAt,
        channelId: REST_WARN_CHANNEL,
      },
    });
  }
  return ids;
}

export async function cancelRestNotifications(ids: ScheduledIds | null | undefined): Promise<void> {
  if (!ids || Platform.OS === 'web') return;
  await Promise.all(
    [ids.end, ids.warn].filter(Boolean).map((id) => Notifications.cancelScheduledNotificationAsync(id!)),
  );
}
