jest.mock('@/store/storage', () => {
  const { createJSONStorage } = jest.requireActual('zustand/middleware');
  const mem = new Map<string, string>();
  return {
    persistStorage: createJSONStorage(() => ({
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    })),
  };
});

import { selectActiveSession, useApp } from '../app-store';

const profile = {
  nickname: '근용',
  goal: 'muscle' as const,
  level: 'intermediate' as const,
  weeklyFreq: 4,
  equipment: ['barbell', 'dumbbell', 'machine', 'cable'] as const,
  consentBody: false,
};

beforeEach(() => useApp.getState().resetAll());

it('온보딩 완료 시 추천 루틴이 생긴다', () => {
  useApp.getState().saveProfile({ ...profile, equipment: [...profile.equipment] });
  useApp.getState().completeOnboarding();
  const { routines, onboarded } = useApp.getState();
  expect(onboarded).toBe(true);
  expect(routines).toHaveLength(2);
});

it('루틴으로 세션 시작 → 세트 완료 → 종료하면 PR이 잡힌다', () => {
  useApp.getState().saveProfile({ ...profile, equipment: [...profile.equipment] });
  useApp.getState().completeOnboarding();
  const routine = useApp.getState().routines[0];
  useApp.getState().startSession(routine.id);

  const active = selectActiveSession(useApp.getState())!;
  const first = active.exercises[0];
  useApp.getState().updateSet(first.id, first.sets[0].id, { weight: 60, reps: 8 });
  const rest = useApp.getState().toggleSetComplete(first.id, first.sets[0].id);
  expect(rest).toBeGreaterThanOrEqual(10);

  const result = useApp.getState().finishSession();
  expect(result.saved).toBe(true);
  expect(result.newPRs.some((p) => p.type === 'max_weight' && p.value === 60)).toBe(true);
  const saved = useApp.getState().sessions.find((s) => s.id === result.sessionId)!;
  // 미완료 세트·운동은 저장되지 않는다
  expect(saved.exercises).toHaveLength(1);
  expect(saved.exercises[0].sets).toHaveLength(1);
});

it('완료 세트가 없으면 세션을 저장하지 않는다', () => {
  useApp.getState().startSession();
  useApp.getState().addExerciseToSession('bench-press');
  expect(useApp.getState().finishSession().saved).toBe(false);
  expect(useApp.getState().sessions).toHaveLength(0);
});

it('Claude 제안 루틴은 승인 전까지 proposed', () => {
  useApp.getState().upsertRoutine({ id: 'r1', name: '제안', source: 'claude', status: 'proposed', items: [] });
  expect(useApp.getState().routines[0].status).toBe('proposed');
  useApp.getState().approveProposal('r1');
  expect(useApp.getState().routines[0].status).toBe('active');
});
