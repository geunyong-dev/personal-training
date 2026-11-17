import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { LIMITS } from '@/domain/rules';

import { isTimerRunning, useRestTimer } from './timer-store';

/** 화면에 남은 시간을 그리기 위한 훅. 앱이 켜져 있을 때 10초 전·종료 시 진동 */
export function useCountdown() {
  const endsAt = useRestTimer((s) => s.endsAt);
  const paused = useRestTimer((s) => s.pausedRemainingMs);
  const totalSec = useRestTimer((s) => s.totalSec);
  const running = isTimerRunning({ endsAt, pausedRemainingMs: paused });
  const [leftMs, setLeftMs] = useState(() => useRestTimer.getState().tick());
  const warned = useRef(false);

  useEffect(() => {
    warned.current = false;
  }, [endsAt]);

  useEffect(() => {
    if (!running) return;
    const update = () => {
      const left = useRestTimer.getState().tick();
      setLeftMs(left);
      if (Platform.OS === 'web' || paused != null) return;
      if (!warned.current && left > 0 && left <= LIMITS.restWarnBeforeEndSec * 1000) {
        warned.current = true;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (left === 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    const first = setTimeout(update, 0); // 시작·조정 직후 바로 반영
    const id = setInterval(update, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [running, paused, endsAt]);

  return { running, paused: paused != null, leftMs: running ? leftMs : 0, totalSec };
}

export function fmtClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
