import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { EXERCISES } from '@/data/exercises';
import { detectNewPRs, mergePRs, recomputePRs } from '@/domain/calc';
import { recommendRoutines } from '@/domain/recommend';
import { canAddSet, isSavable, resolveRestSec, shouldAutoClose } from '@/domain/rules';
import type {
  Exercise,
  PersonalRecord,
  Profile,
  Routine,
  Session,
  SessionExercise,
  Settings,
  WorkoutSet,
} from '@/domain/types';
import { nowIso, uuid } from '@/lib/id';

import { persistStorage } from './storage';

export type Tombstone = { table: 'sessions' | 'routines' | 'exercises'; id: string; at: string };

export interface AppState {
  onboarded: boolean;
  /** MCP 서버가 첫 인증 호출 때 기록하는 연결 상태를 서버에서 확인한 결과 */
  claudeConnected: boolean;
  profile: Profile | null;
  settings: Settings;
  customExercises: Exercise[];
  routines: Routine[];
  sessions: Session[]; // 진행 중 세션 포함 (endedAt 없음)
  prs: PersonalRecord[];
  tombstones: Tombstone[];
  lastSyncedAt: string | null;

  // 프로필·설정
  saveProfile: (p: Profile) => void;
  completeOnboarding: () => void;
  setClaudeConnected: (v: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // 운동 라이브러리
  addCustomExercise: (e: Omit<Exercise, 'id' | 'isCustom'>) => Exercise;

  // 루틴
  upsertRoutine: (r: Omit<Routine, 'createdAt' | 'updatedAt'> & Partial<Pick<Routine, 'createdAt'>>) => void;
  deleteRoutine: (id: string) => void;
  approveProposal: (id: string) => void;
  rejectProposal: (id: string) => void;

  // 세션
  startSession: (routineId?: string) => string;
  addExerciseToSession: (exerciseId: string) => void;
  removeExerciseFromSession: (sessionExerciseId: string) => void;
  addSet: (sessionExerciseId: string, init?: Partial<WorkoutSet>) => void;
  updateSet: (sessionExerciseId: string, setId: string, patch: Partial<WorkoutSet>) => void;
  removeSet: (sessionExerciseId: string, setId: string) => void;
  /** 완료 토글. 완료로 바뀌면 시작할 휴식 시간(초)을 돌려준다 */
  toggleSetComplete: (sessionExerciseId: string, setId: string) => number | null;
  setSessionMemo: (memo: string) => void;
  finishSession: (reason?: Session['endReason']) => { saved: boolean; sessionId: string; newPRs: PersonalRecord[] };
  discardActiveSession: () => void;
  deleteSession: (id: string) => void;
  runAutoClose: () => void;

  // 동기화
  applyRemote: (data: Partial<Pick<AppState, 'routines' | 'sessions' | 'prs' | 'customExercises' | 'profile'>>) => void;
  markSynced: (at: string) => void;
  resetAll: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  defaultRestSec: 90,
  autoStartRest: true,
  restSound: true,
};

const INITIAL = {
  onboarded: false,
  claudeConnected: false,
  profile: null,
  settings: DEFAULT_SETTINGS,
  customExercises: [] as Exercise[],
  routines: [] as Routine[],
  sessions: [] as Session[],
  prs: [] as PersonalRecord[],
  tombstones: [] as Tombstone[],
  lastSyncedAt: null,
};

export function allExercises(state: Pick<AppState, 'customExercises'>): Exercise[] {
  return [...EXERCISES, ...state.customExercises];
}

export function findExercise(state: Pick<AppState, 'customExercises'>, id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id) ?? state.customExercises.find((e) => e.id === id);
}

export const selectActiveSession = (s: Pick<AppState, 'sessions'>): Session | undefined =>
  s.sessions.find((x) => !x.endedAt);

export const selectFinishedSessions = (s: Pick<AppState, 'sessions'>): Session[] =>
  s.sessions.filter((x) => !!x.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      /** 진행 중 세션을 수정하는 헬퍼 */
      const mutateActive = (fn: (s: Session) => Session) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.endedAt ? s : { ...fn(s), updatedAt: nowIso() })),
        }));

      const mutateExercise = (sessionExerciseId: string, fn: (e: SessionExercise) => SessionExercise) =>
        mutateActive((s) => ({
          ...s,
          exercises: s.exercises.map((e) => (e.id === sessionExerciseId ? fn(e) : e)),
        }));

      return {
        ...INITIAL,

        saveProfile: (profile) => set({ profile }),

        completeOnboarding: () => {
          const { profile, routines } = get();
          if (!profile) return;
          // 첫 온보딩 때만 규칙 기반 추천 루틴을 넣어 준다
          const seeded =
            routines.length === 0 ? recommendRoutines(profile, allExercises(get()), new Date(), uuid) : [];
          set({ onboarded: true, routines: [...routines, ...seeded] });
        },

        setClaudeConnected: (claudeConnected) => set({ claudeConnected }),

        updateSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),

        addCustomExercise: (e) => {
          const ex: Exercise = { ...e, id: uuid(), isCustom: true };
          set((st) => ({ customExercises: [...st.customExercises, ex] }));
          return ex;
        },

        upsertRoutine: (r) =>
          set((st) => {
            const now = nowIso();
            const exists = st.routines.find((x) => x.id === r.id);
            const next: Routine = { ...r, createdAt: exists?.createdAt ?? r.createdAt ?? now, updatedAt: now };
            return {
              routines: exists ? st.routines.map((x) => (x.id === r.id ? next : x)) : [...st.routines, next],
            };
          }),

        deleteRoutine: (id) =>
          set((st) => ({
            routines: st.routines.filter((r) => r.id !== id),
            tombstones: [...st.tombstones, { table: 'routines', id, at: nowIso() }],
          })),

        // Claude가 제안한 루틴은 사용자가 승인해야 활성화된다 (5.5)
        approveProposal: (id) =>
          set((st) => ({
            routines: st.routines.map((r) =>
              r.id === id && r.status === 'proposed' ? { ...r, status: 'active', updatedAt: nowIso() } : r,
            ),
          })),

        rejectProposal: (id) =>
          set((st) => ({
            routines: st.routines.map((r) =>
              r.id === id && r.status === 'proposed' ? { ...r, status: 'archived', updatedAt: nowIso() } : r,
            ),
          })),

        startSession: (routineId) => {
          const active = selectActiveSession(get());
          if (active) return active.id;
          const now = nowIso();
          const routine = get().routines.find((r) => r.id === routineId);
          const session: Session = {
            id: uuid(),
            routineId: routine?.id,
            startedAt: now,
            updatedAt: now,
            exercises:
              routine?.items.map((it) => ({
                id: uuid(),
                exerciseId: it.exerciseId,
                restSec: it.restSec,
                sets: Array.from({ length: it.targetSets }, () => ({
                  id: uuid(),
                  kind: 'normal' as const,
                  weight: it.targetWeight ?? 0,
                  reps: it.targetReps,
                })),
              })) ?? [],
          };
          set((st) => ({ sessions: [...st.sessions, session] }));
          return session.id;
        },

        addExerciseToSession: (exerciseId) =>
          mutateActive((s) => ({
            ...s,
            exercises: [
              ...s.exercises,
              { id: uuid(), exerciseId, sets: [{ id: uuid(), kind: 'normal', weight: 0, reps: 10 }] },
            ],
          })),

        removeExerciseFromSession: (sessionExerciseId) =>
          mutateActive((s) => ({ ...s, exercises: s.exercises.filter((e) => e.id !== sessionExerciseId) })),

        addSet: (sessionExerciseId, init) =>
          mutateExercise(sessionExerciseId, (e) => {
            if (!canAddSet(e)) return e;
            const prev = e.sets.at(-1);
            return {
              ...e,
              sets: [
                ...e.sets,
                { id: uuid(), kind: 'normal', weight: prev?.weight ?? 0, reps: prev?.reps ?? 10, ...init },
              ],
            };
          }),

        updateSet: (sessionExerciseId, setId, patch) =>
          mutateExercise(sessionExerciseId, (e) => ({
            ...e,
            sets: e.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)),
          })),

        removeSet: (sessionExerciseId, setId) =>
          mutateExercise(sessionExerciseId, (e) => ({ ...e, sets: e.sets.filter((x) => x.id !== setId) })),

        toggleSetComplete: (sessionExerciseId, setId) => {
          const active = selectActiveSession(get());
          const ex = active?.exercises.find((e) => e.id === sessionExerciseId);
          const target = ex?.sets.find((x) => x.id === setId);
          if (!active || !ex || !target) return null;

          if (target.completedAt) {
            mutateExercise(sessionExerciseId, (e) => ({
              ...e,
              sets: e.sets.map((x) => (x.id === setId ? { ...x, completedAt: undefined, restActualSec: undefined } : x)),
            }));
            return null;
          }

          // 실제 휴식 = 직전 완료 세트(세션 전체 기준) → 지금
          const now = Date.now();
          const lastDone = active.exercises
            .flatMap((e) => e.sets)
            .filter((x) => x.completedAt)
            .map((x) => Date.parse(x.completedAt!))
            .sort((a, b) => b - a)[0];
          const restActualSec = lastDone ? Math.round((now - lastDone) / 1000) : undefined;

          mutateExercise(sessionExerciseId, (e) => ({
            ...e,
            sets: e.sets.map((x) =>
              x.id === setId ? { ...x, completedAt: new Date(now).toISOString(), restActualSec } : x,
            ),
          }));

          const def = findExercise(get(), ex.exerciseId);
          return resolveRestSec(def?.defaultRestSec, ex.restSec, get().settings);
        },

        setSessionMemo: (memo) => mutateActive((s) => ({ ...s, memo })),

        finishSession: (reason = 'manual') => {
          const active = selectActiveSession(get());
          if (!active) return { saved: false, sessionId: '', newPRs: [] };
          if (!isSavable(active)) {
            set((st) => ({ sessions: st.sessions.filter((s) => s.id !== active.id) }));
            return { saved: false, sessionId: active.id, newPRs: [] };
          }
          const now = nowIso();
          // 미완료 세트는 기록에서 뺀다
          const finished: Session = {
            ...active,
            endedAt: now,
            endReason: reason,
            updatedAt: now,
            exercises: active.exercises
              .map((e) => ({ ...e, sets: e.sets.filter((x) => !!x.completedAt) }))
              .filter((e) => e.sets.length > 0),
          };
          const newPRs = detectNewPRs(finished, get().prs);
          set((st) => ({
            sessions: st.sessions.map((s) => (s.id === active.id ? finished : s)),
            prs: mergePRs(st.prs, newPRs),
          }));
          return { saved: true, sessionId: finished.id, newPRs };
        },

        discardActiveSession: () =>
          set((st) => ({ sessions: st.sessions.filter((s) => !!s.endedAt) })),

        deleteSession: (id) =>
          set((st) => {
            const sessions = st.sessions.filter((s) => s.id !== id);
            return {
              sessions,
              prs: recomputePRs(sessions), // 지운 세션에서 나온 PR은 다시 계산
              tombstones: [...st.tombstones, { table: 'sessions', id, at: nowIso() }],
            };
          }),

        runAutoClose: () => {
          const active = selectActiveSession(get());
          if (active && shouldAutoClose(active)) get().finishSession('auto');
        },

        // 서버 데이터 병합: id 기준, updatedAt이 더 최근인 쪽을 남긴다 (5.2 충돌 규칙)
        applyRemote: (data) =>
          set((st) => {
            const merge = <T extends { id: string; updatedAt: string }>(local: T[], remote?: T[]) => {
              if (!remote) return local;
              const map = new Map(local.map((x) => [x.id, x]));
              for (const r of remote) {
                const l = map.get(r.id);
                if (!l || r.updatedAt > l.updatedAt) map.set(r.id, r);
              }
              const dead = new Set(st.tombstones.map((t) => t.id));
              return [...map.values()].filter((x) => !dead.has(x.id));
            };
            return {
              routines: merge(st.routines, data.routines),
              sessions: merge(st.sessions, data.sessions),
              prs: data.prs ? mergePRs(st.prs, data.prs) : st.prs,
              customExercises: data.customExercises
                ? [
                    ...st.customExercises.filter((e) => !data.customExercises!.some((r) => r.id === e.id)),
                    ...data.customExercises,
                  ]
                : st.customExercises,
              profile: data.profile ?? st.profile,
            };
          }),

        markSynced: (at) => set({ lastSyncedAt: at, tombstones: [] }),

        resetAll: () => set({ ...INITIAL }),
      };
    },
    {
      name: 'workout-app',
      storage: persistStorage,
      version: 1,
    },
  ),
);
