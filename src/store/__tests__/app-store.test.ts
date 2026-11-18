import { selectActiveSession, useApp } from '../app-store';

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

beforeEach(() => useApp.getState().resetAll());

it('기기 인증은 한 번만: 다시 호출해도 같은 사용자', () => {
  const a = useApp.getState().authenticate('근용');
  const b = useApp.getState().authenticate('다른이름');
  expect(b.id).toBe(a.id);
  expect(b.nickname).toBe('근용');
});

it('요일 계획 저장·삭제', () => {
  useApp.getState().setDayPlan(2, { title: '하체', items: [{ exerciseId: 'back-squat', sets: 5, reps: 5, weightKg: 100 }] });
  expect(useApp.getState().plan.days[2]?.items).toHaveLength(1);
  useApp.getState().setDayPlan(2, null);
  expect(useApp.getState().plan.days[2]).toBeUndefined();
});

it('계획으로 시작 → 지금 세트 완료 → 종료하면 기록·PR 저장', () => {
  useApp.getState().setDayPlan(0, { items: [{ exerciseId: 'bench-press', sets: 2, reps: 8, weightKg: 60 }] });
  expect(useApp.getState().startSessionFromPlan(0)).toBeTruthy();
  const ex = selectActiveSession(useApp.getState())!.exercises[0];
  expect(useApp.getState().completeCurrentSet(ex.id)).toBeGreaterThanOrEqual(10);
  const after = selectActiveSession(useApp.getState())!.exercises[0];
  expect(after.sets.filter((s) => s.completedAt)).toHaveLength(1);

  const res = useApp.getState().finishSession();
  expect(res.saved).toBe(true);
  expect(res.newPRs.some((p) => p.type === 'max_weight' && p.value === 60)).toBe(true);
  const saved = useApp.getState().sessions.find((s) => s.id === res.sessionId)!;
  expect(saved.exercises[0].sets).toHaveLength(1); // 미완료 세트는 빠진다
  expect(saved.planDay).toBe(0);
});

it('계획이 없는 요일은 시작하지 않는다', () => {
  expect(useApp.getState().startSessionFromPlan(3)).toBeNull();
});

it('서버 계획은 더 최신일 때만 반영', () => {
  useApp.getState().setDayPlan(1, { items: [{ exerciseId: 'deadlift', sets: 3, reps: 5 }] });
  const local = useApp.getState().plan;
  useApp.getState().applyServerPlan({ days: {}, updatedAt: '2000-01-01T00:00:00.000Z' });
  expect(useApp.getState().plan).toBe(local);
  useApp.getState().applyServerPlan({ days: { 4: { items: [{ exerciseId: 'pull-up', sets: 3, reps: 8 }], source: 'claude', updatedAt: '2999-01-01T00:00:00.000Z' } }, updatedAt: '2999-01-01T00:00:00.000Z' });
  expect(useApp.getState().plan.days[4]?.source).toBe('claude');
});

it('세션을 지우면 PR을 다시 계산하고 삭제 목록에 남긴다', () => {
  for (const w of [60, 70]) {
    useApp.getState().setDayPlan(0, { items: [{ exerciseId: 'bench-press', sets: 1, reps: 5, weightKg: w }] });
    useApp.getState().startSessionFromPlan(0);
    const ex = selectActiveSession(useApp.getState())!.exercises[0];
    useApp.getState().completeCurrentSet(ex.id);
    useApp.getState().finishSession();
  }
  const max = () => useApp.getState().prs.find((p) => p.type === 'max_weight')?.value;
  expect(max()).toBe(70);
  const heavy = useApp.getState().sessions.find((s) => s.exercises[0].sets[0].weight === 70)!;
  useApp.getState().deleteSession(heavy.id);
  expect(max()).toBe(60);
  expect(useApp.getState().deletedSessionIds).toContain(heavy.id);
});

it('인증하면 서버용 기기 비밀키가 만들어지고, 초기화하면 지워진다', () => {
  useApp.getState().authenticate('근용');
  expect(useApp.getState().deviceSecret).toMatch(/^[0-9a-f]{64}$/);
  useApp.getState().resetAll();
  expect(useApp.getState().deviceSecret).toBeNull();
  expect(useApp.getState().user).toBeNull();
});
