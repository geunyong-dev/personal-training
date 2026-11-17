// 세트 간 휴식 타이머 상태 (정의서 5.3)
// 종료 "시각"을 저장해서 앱이 꺼졌다 켜져도 남은 시간이 정확하다.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { clampRest, LIMITS } from '@/domain/rules';
import { persistStorage } from '@/store/storage';

import { endRestActivity, showRestActivity } from './live-activity';
import { cancelRestNotifications, scheduleRestNotifications, type ScheduledIds } from './notify';

export type RestContext = { exerciseName: string; nextSetLabel: string };

interface TimerState {
  startMs: number | null;
  endsAt: number | null; // 진행 중일 때 종료 시각
  pausedRemainingMs: number | null; // 일시정지 중일 때 남은 시간
  totalSec: number;
  context: RestContext | null;
  scheduled: ScheduledIds | null;
  sound: boolean;
  /** 운동 화면 바텀시트 표시 여부: 세트 완료(타이머 시작) 때 올라오고 타이머가 끝나면 내려간다 */
  sheetVisible: boolean;

  showSheet: () => void;
  hideSheet: () => void;
  start: (sec: number, ctx: RestContext, opts?: { sound?: boolean }) => Promise<void>;
  adjust: (deltaSec: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  /** 시간이 다 됐으면 정리한다. 남은 ms 반환 */
  tick: () => number;
}

export const useRestTimer = create<TimerState>()(
  persist(
    (set, get) => {
      const reschedule = async (endsAt: number, startMs: number) => {
        const { context, scheduled, sound, pausedRemainingMs } = get();
        await cancelRestNotifications(scheduled);
        const label = context ? `${context.exerciseName} · 다음 ${context.nextSetLabel}` : '';
        const ids = await scheduleRestNotifications(endsAt, label, {
          sound,
          warnBeforeSec: LIMITS.restWarnBeforeEndSec,
        });
        set({ scheduled: ids });
        if (context) {
          await showRestActivity({
            startMs,
            endMs: endsAt,
            exerciseName: context.exerciseName,
            nextSetLabel: context.nextSetLabel,
            pausedAtMs: pausedRemainingMs != null ? Date.now() : undefined,
          });
        }
      };

      const clear = async () => {
        const { scheduled } = get();
        set({ startMs: null, endsAt: null, pausedRemainingMs: null, context: null, scheduled: null, sheetVisible: false });
        await cancelRestNotifications(scheduled);
        await endRestActivity();
      };

      return {
        startMs: null,
        endsAt: null,
        pausedRemainingMs: null,
        totalSec: 0,
        context: null,
        scheduled: null,
        sound: true,
        sheetVisible: false,

        showSheet: () => set({ sheetVisible: true }),
        hideSheet: () => set({ sheetVisible: false }),

        start: async (sec, ctx, opts) => {
          const total = clampRest(sec);
          const now = Date.now();
          const endsAt = now + total * 1000;
          set({
            startMs: now,
            endsAt,
            pausedRemainingMs: null,
            totalSec: total,
            context: ctx,
            sound: opts?.sound ?? true,
            sheetVisible: true,
          });
          await reschedule(endsAt, now);
        },

        adjust: async (deltaSec) => {
          const { endsAt, pausedRemainingMs, startMs, totalSec } = get();
          if (pausedRemainingMs != null) {
            set({ pausedRemainingMs: Math.max(1000, pausedRemainingMs + deltaSec * 1000) });
            return;
          }
          if (!endsAt || !startMs) return;
          const next = Math.max(Date.now() + 1000, endsAt + deltaSec * 1000);
          set({ endsAt: next, totalSec: Math.max(1, totalSec + deltaSec) });
          await reschedule(next, startMs);
        },

        pause: async () => {
          const { endsAt, scheduled, startMs, context } = get();
          if (!endsAt) return;
          const remaining = Math.max(0, endsAt - Date.now());
          set({ endsAt: null, pausedRemainingMs: remaining });
          await cancelRestNotifications(scheduled);
          set({ scheduled: null });
          if (context && startMs) {
            await showRestActivity({
              startMs,
              endMs: Date.now() + remaining,
              exerciseName: context.exerciseName,
              nextSetLabel: context.nextSetLabel,
              pausedAtMs: Date.now(),
            });
          }
        },

        resume: async () => {
          const { pausedRemainingMs } = get();
          if (pausedRemainingMs == null) return;
          const now = Date.now();
          const endsAt = now + pausedRemainingMs;
          const startMs = endsAt - get().totalSec * 1000;
          set({ endsAt, startMs, pausedRemainingMs: null });
          await reschedule(endsAt, startMs);
        },

        skip: clear,

        tick: () => {
          const { endsAt, pausedRemainingMs } = get();
          if (pausedRemainingMs != null) return pausedRemainingMs;
          if (!endsAt) return 0;
          const left = endsAt - Date.now();
          if (left <= 0) {
            // 알림은 이미 울렸으니 상태만 정리
            set({ startMs: null, endsAt: null, context: null, scheduled: null, sheetVisible: false });
            void endRestActivity();
            return 0;
          }
          return left;
        },
      };
    },
    {
      name: 'workout-app-timer',
      storage: persistStorage,
      partialize: (s) => ({
        startMs: s.startMs,
        endsAt: s.endsAt,
        pausedRemainingMs: s.pausedRemainingMs,
        totalSec: s.totalSec,
        context: s.context,
        scheduled: s.scheduled,
        sound: s.sound,
      }),
    },
  ),
);

export function isTimerRunning(s: Pick<TimerState, 'endsAt' | 'pausedRemainingMs'>): boolean {
  return s.endsAt != null || s.pausedRemainingMs != null;
}
