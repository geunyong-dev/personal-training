import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { EXERCISES } from '@/data/exercises';
import { detectNewPRs, mergePRs, recomputePRs } from '@/domain/calc';
import { currentSetIndex, sessionFromPlan } from '@/domain/plan';
import { canAddSet, isSavable, resolveRestSec, shouldAutoClose } from '@/domain/rules';
import type {
  DayPlan,
  Exercise,
  LocalUser,
  PersonalRecord,
  Session,
  SessionExercise,
  Settings,
  Weekday,
  WeeklyPlan,
  WorkoutSet,
} from '@/domain/types';
import { nowIso, uuid } from '@/lib/id';
import { newDeviceSecret } from '@/lib/secret';

import { persistStorage } from './storage';

/** 동기화 서버가 알려 주는 Claude(MCP) 연결 상태 */
export interface McpStatus {
  serverReachable: boolean;
  connected: boolean; // Claude가 한 번이라도 이 기기 데이터로 MCP를 호출했는지
  lastCallAt?: string;
  recentCalls: { tool: string; at: string; ok: boolean }[];
  checkedAt?: string;
  error?: string; // 마지막 동기화 실패 이유 (인증 실패 등)
}

export interface AppState {
  hydrated: boolean;
  user: LocalUser | null;
  deviceSecret: string | null; // 서버에 이 기기를 증명하는 비밀키 (기기에만 저장)
  mcpToken: string | null; // 서버가 발급한 Claude 연결 토큰
  settings: Settings;
  plan: WeeklyPlan;
  customExercises: Exercise[];
  sessions: Session[]; // 진행 중 세션 포함 (endedAt 없음)
  prs: PersonalRecord[];
  deletedSessionIds: string[];
  serverUrl: string; // PC 동기화 서버 주소
  lastSyncedAt: string | null;
  mcp: McpStatus;

  // 인증 (목업: 기기별 로컬 인증, 한 번만)
  authenticate: (nickname: string) => LocalUser;

  // 설정
  updateSettings: (patch: Partial<Settings>) => void;
  setServerUrl: (url: string) => void;
  setMcpStatus: (s: McpStatus) => void;
  setMcpToken: (t: string | null) => void;

  // 운동 라이브러리
  addCustomExercise: (e: Omit<Exercise, 'id' | 'isCustom'>) => Exercise;

  // 주간 계획
  setDayPlan: (day: Weekday, plan: Omit<DayPlan, 'updatedAt' | 'source'> | null, source?: DayPlan['source']) => void;
  applyServerPlan: (plan: WeeklyPlan) => void;

  // 세션
  startSessionFromPlan: (day: Weekday) => string | null;
  addExerciseToSession: (exerciseId: string) => void;
  removeExerciseFromSession: (sessionExerciseId: string) => void;
  addSet: (sessionExerciseId: string, init?: Partial<WorkoutSet>) => void;
  updateSet: (sessionExerciseId: string, setId: string, patch: Partial<WorkoutSet>) => void;
  removeSet: (sessionExerciseId: string, setId: string) => void;
  /** 완료 토글. 완료로 바뀌면 시작할 휴식 시간(초)을 돌려준다 */
  toggleSetComplete: (sessionExerciseId: string, setId: string) => number | null;
  /** 지금 할 세트(첫 미완료)를 완료. 휴식 시간(초) 또는 null */
  completeCurrentSet: (sessionExerciseId: string) => number | null;
  setSessionMemo: (memo: string) => void;
  finishSession: (reason?: Session['endReason']) => { saved: boolean; sessionId: string; newPRs: PersonalRecord[] };
  discardActiveSession: () => void;
  deleteSession: (id: string) => void;
  runAutoClose: () => void;

  markSynced: (at: string, syncedDeletes: string[]) => void;
  resetAll: () => void;
}

const DEFAULT_SETTINGS: Settings = { unit: 'kg', defaultRestSec: 90, autoStartRest: true, restSound: true };

/** 빌드할 때 넣는 기본 동기화 서버 주소 (예: https://personal-training-sync.fly.dev) */
const DEFAULT_SERVER_URL = (process.env.EXPO_PUBLIC_SYNC_URL ?? '').replace(/\/+$/, '');

const INITIAL = {
  user: null,
  deviceSecret: null,
  mcpToken: null,
  settings: DEFAULT_SETTINGS,
  plan: { days: {}, updatedAt: '1970-01-01T00:00:00.000Z' } as WeeklyPlan,
  customExercises: [] as Exercise[],
  sessions: [] as Session[],
  prs: [] as PersonalRecord[],
  deletedSessionIds: [] as string[],
  serverUrl: DEFAULT_SERVER_URL,
  lastSyncedAt: null,
  mcp: { serverReachable: false, connected: false, recentCalls: [] } as McpStatus,
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
      const mutateActive = (fn: (s: Session) => Session) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.endedAt ? s : { ...fn(s), updatedAt: nowIso() })),
        }));

      const mutateExercise = (sessionExerciseId: string, fn: (e: SessionExercise) => SessionExercise) =>
        mutateActive((s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === sessionExerciseId ? fn(e) : e)) }));

      /** setId 세트를 완료 처리하고 휴식 시간을 계산 */
      const complete = (sessionExerciseId: string, setId: string): number | null => {
        const active = selectActiveSession(get());
        const ex = active?.exercises.find((e) => e.id === sessionExerciseId);
        if (!active || !ex) return null;
        const now = Date.now();
        // 실제 휴식 = 직전 완료 세트(세션 전체 기준) → 지금
        const lastDone = active.exercises
          .flatMap((e) => e.sets)
          .filter((x) => x.completedAt)
          .map((x) => Date.parse(x.completedAt!))
          .sort((a, b) => b - a)[0];
        const restActualSec = lastDone ? Math.round((now - lastDone) / 1000) : undefined;
        mutateExercise(sessionExerciseId, (e) => ({
          ...e,
          sets: e.sets.map((x) => (x.id === setId ? { ...x, completedAt: new Date(now).toISOString(), restActualSec } : x)),
        }));
        const def = findExercise(get(), ex.exerciseId);
        return resolveRestSec(def?.defaultRestSec, ex.restSec, get().settings);
      };

      return {
        ...INITIAL,
        hydrated: false,

        authenticate: (nickname) => {
          const existing = get().user;
          if (existing) return existing; // 이미 인증한 기기는 다시 하지 않는다
          const user: LocalUser = { id: uuid(), nickname: nickname.trim(), createdAt: nowIso() };
          set({ user, deviceSecret: newDeviceSecret(), mcpToken: null });
          return user;
        },

        updateSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),
        setServerUrl: (serverUrl) => set({ serverUrl: serverUrl.trim().replace(/\/+$/, '') }),
        setMcpStatus: (mcp) => set({ mcp }),
        setMcpToken: (mcpToken) => set({ mcpToken }),

        addCustomExercise: (e) => {
          const ex: Exercise = { ...e, id: uuid(), isCustom: true };
          set((st) => ({ customExercises: [...st.customExercises, ex] }));
          return ex;
        },

        setDayPlan: (day, plan, source = 'user') =>
          set((st) => {
            const now = nowIso();
            const days = { ...st.plan.days };
            if (plan && plan.items.length > 0) days[day] = { ...plan, source, updatedAt: now };
            else delete days[day];
            return { plan: { days, updatedAt: now } };
          }),

        // 서버(Claude가 MCP로 수정한) 계획이 더 최신이면 받아들인다
        applyServerPlan: (plan) =>
          set((st) => (plan.updatedAt > st.plan.updatedAt ? { plan } : {})),

        startSessionFromPlan: (day) => {
          const active = selectActiveSession(get());
          if (active) return active.id;
          const plan = get().plan.days[day];
          if (!plan || plan.items.length === 0) return null;
          const session = sessionFromPlan(plan, day, uuid);
          set((st) => ({ sessions: [...st.sessions, session] }));
          return session.id;
        },

        addExerciseToSession: (exerciseId) =>
          mutateActive((s) => ({
            ...s,
            exercises: [...s.exercises, { id: uuid(), exerciseId, sets: [{ id: uuid(), kind: 'normal', weight: 0, reps: 10 }] }],
          })),

        removeExerciseFromSession: (sessionExerciseId) =>
          mutateActive((s) => ({ ...s, exercises: s.exercises.filter((e) => e.id !== sessionExerciseId) })),

        addSet: (sessionExerciseId, init) =>
          mutateExercise(sessionExerciseId, (e) => {
            if (!canAddSet(e)) return e;
            const prev = e.sets.at(-1);
            return {
              ...e,
              sets: [...e.sets, { id: uuid(), kind: 'normal', weight: prev?.weight ?? 0, reps: prev?.reps ?? 10, ...init }],
            };
          }),

        updateSet: (sessionExerciseId, setId, patch) =>
          mutateExercise(sessionExerciseId, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) })),

        removeSet: (sessionExerciseId, setId) =>
          mutateExercise(sessionExerciseId, (e) => ({ ...e, sets: e.sets.filter((x) => x.id !== setId) })),

        toggleSetComplete: (sessionExerciseId, setId) => {
          const ex = selectActiveSession(get())?.exercises.find((e) => e.id === sessionExerciseId);
          const target = ex?.sets.find((x) => x.id === setId);
          if (!ex || !target) return null;
          if (target.completedAt) {
            mutateExercise(sessionExerciseId, (e) => ({
              ...e,
              sets: e.sets.map((x) => (x.id === setId ? { ...x, completedAt: undefined, restActualSec: undefined } : x)),
            }));
            return null;
          }
          return complete(sessionExerciseId, setId);
        },

        completeCurrentSet: (sessionExerciseId) => {
          const ex = selectActiveSession(get())?.exercises.find((e) => e.id === sessionExerciseId);
          if (!ex) return null;
          const i = currentSetIndex(ex);
          return i < 0 ? null : complete(sessionExerciseId, ex.sets[i].id);
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

        discardActiveSession: () => set((st) => ({ sessions: st.sessions.filter((s) => !!s.endedAt) })),

        deleteSession: (id) =>
          set((st) => {
            const sessions = st.sessions.filter((s) => s.id !== id);
            return { sessions, prs: recomputePRs(sessions), deletedSessionIds: [...st.deletedSessionIds, id] };
          }),

        runAutoClose: () => {
          const active = selectActiveSession(get());
          if (active && shouldAutoClose(active)) get().finishSession('auto');
        },

        markSynced: (at, syncedDeletes) =>
          set((st) => {
            const rest = st.deletedSessionIds.filter((id) => !syncedDeletes.includes(id));
            // 배열이 그대로면 참조를 유지해 동기화가 다시 트리거되지 않게
            return { lastSyncedAt: at, deletedSessionIds: rest.length === st.deletedSessionIds.length ? st.deletedSessionIds : rest };
          }),

        resetAll: () => set({ ...INITIAL }),
      };
    },
    {
      name: 'workout-app',
      storage: persistStorage,
      version: 3,
      partialize: ({ hydrated: _h, ...rest }) => rest,
      // v1(루틴·Supabase 시절) 데이터에서 기록만 살린다
      migrate: (old, version) => {
        const o = (old ?? {}) as Partial<AppState> & { profile?: { nickname?: string } };
        if (version < 2) {
          return {
            ...INITIAL,
            settings: o.settings ?? DEFAULT_SETTINGS,
            sessions: o.sessions ?? [],
            prs: o.prs ?? [],
            customExercises: o.customExercises ?? [],
          } as unknown as AppState;
        }
        // v2 → v3: 서버 인증용 기기 비밀키 추가
        if (version < 3 && o.user && !o.deviceSecret) return { ...o, deviceSecret: newDeviceSecret(), mcpToken: null } as AppState;
        return o as AppState;
      },
    },
  ),
);

// 저장된 JSON을 다 읽었는지 (스플래시·인증 리다이렉트가 이 값을 기다린다)
const markHydrated = () => useApp.setState({ hydrated: true });
if (useApp.persist.hasHydrated()) markHydrated();
else useApp.persist.onFinishHydration(markHydrated);
