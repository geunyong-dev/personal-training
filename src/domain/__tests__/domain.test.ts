import {
  detectNewPRs,
  estimate1RM,
  lastSetsFor,
  mergePRs,
  overloadWarning,
  sessionVolume,
} from '../calc';
import { currentSetIndex, footerAction, parseWeekday, sessionFromPlan, validatePlanItem, weekdayOf } from '../plan';
import {
  formatWeight,
  isSavable,
  resolveRestSec,
  shouldAutoClose,
  toKg,
  validateNickname,
  validateSet,
} from '../rules';
import type { Session, WorkoutSet } from '../types';

const set = (p: Partial<WorkoutSet>): WorkoutSet => ({
  id: Math.random().toString(36).slice(2),
  kind: 'normal',
  weight: 0,
  reps: 0,
  completedAt: '2026-11-17T10:00:00Z',
  ...p,
});

const session = (id: string, startedAt: string, sets: WorkoutSet[], exerciseId = 'bench-press'): Session => ({
  id,
  startedAt,
  endedAt: startedAt,
  updatedAt: startedAt,
  exercises: [{ id: `${id}-e`, exerciseId, sets }],
});

describe('calc', () => {
  it('Epley 1RM: 10회 이하만 계산', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBe(116.7);
    expect(estimate1RM(100, 11)).toBeNull();
  });

  it('볼륨에서 웜업과 미완료 세트를 제외', () => {
    const s = session('s1', '2026-11-17T10:00:00Z', [
      set({ weight: 40, reps: 10, kind: 'warmup' }),
      set({ weight: 100, reps: 5 }),
      set({ weight: 100, reps: 5, completedAt: undefined }),
    ]);
    expect(sessionVolume(s)).toBe(500);
  });

  it('PR은 기존보다 엄격히 클 때만 갱신', () => {
    const s1 = session('s1', '2026-11-10T10:00:00Z', [set({ weight: 100, reps: 5 })]);
    const first = detectNewPRs(s1, []);
    expect(first.map((p) => p.type).sort()).toEqual(['e1rm', 'max_weight', 'volume']);
    const s2 = session('s2', '2026-11-17T10:00:00Z', [set({ weight: 100, reps: 3 })]);
    expect(detectNewPRs(s2, first)).toEqual([]);
    const s3 = session('s3', '2026-11-18T10:00:00Z', [set({ weight: 102.5, reps: 3 })]);
    const merged = mergePRs(first, detectNewPRs(s3, first));
    expect(merged.find((p) => p.type === 'max_weight')?.value).toBe(102.5);
  });

  it('직전 기록 힌트는 가장 최근 세션에서 가져옴', () => {
    const old = session('a', '2026-11-01T10:00:00Z', [set({ weight: 60, reps: 10 })]);
    const recent = session('b', '2026-11-10T10:00:00Z', [set({ weight: 65, reps: 8 })]);
    expect(lastSetsFor('bench-press', [old, recent])[0].weight).toBe(65);
    expect(lastSetsFor('bench-press', [old, recent], 'b')[0].weight).toBe(60);
  });

  it('이번 주 볼륨이 직전 4주 평균의 130% 이상이면 경고', () => {
    const now = new Date('2026-11-18T12:00:00'); // 수요일
    const prev = ['2026-11-11', '2026-11-04', '2026-10-28', '2026-10-21'].map((d, i) =>
      session(`p${i}`, `${d}T10:00:00`, [set({ weight: 100, reps: 10 })]),
    );
    const light = session('t1', '2026-11-17T10:00:00', [set({ weight: 100, reps: 10 })]);
    expect(overloadWarning([...prev, light], now)).toBe(false);
    const heavy = session('t2', '2026-11-17T10:00:00', [set({ weight: 100, reps: 13 })]);
    expect(overloadWarning([...prev, heavy], now)).toBe(true);
    expect(overloadWarning([heavy], now)).toBe(false);
  });
});

describe('rules', () => {
  it('휴식 우선순위: 운동별 > 루틴 > 전역, 10초~10분 범위', () => {
    expect(resolveRestSec(150, 90, { defaultRestSec: 60 })).toBe(150);
    expect(resolveRestSec(undefined, 90, { defaultRestSec: 60 })).toBe(90);
    expect(resolveRestSec(undefined, undefined, { defaultRestSec: 60 })).toBe(60);
    expect(resolveRestSec(5, undefined, { defaultRestSec: 60 })).toBe(10);
    expect(resolveRestSec(9999, undefined, { defaultRestSec: 60 })).toBe(600);
  });

  it('범위 밖 입력은 확인 요구', () => {
    expect(validateSet(100, 5)).toEqual({ ok: true });
    expect(validateSet(600, 5).ok).toBe(false);
    expect(validateSet(100, 0).ok).toBe(false);
  });

  it('3시간 무활동 자동 종료, 완료 세트 0개는 저장 안 함', () => {
    const s: Session = {
      id: 'x',
      startedAt: '2026-11-17T10:00:00Z',
      updatedAt: '2026-11-17T10:00:00Z',
      exercises: [{ id: 'e', exerciseId: 'bench-press', sets: [set({ completedAt: undefined })] }],
    };
    expect(shouldAutoClose(s, Date.parse('2026-11-17T12:59:00Z'))).toBe(false);
    expect(shouldAutoClose(s, Date.parse('2026-11-17T13:00:00Z'))).toBe(true);
    expect(isSavable(s)).toBe(false);
  });

  it('단위 변환과 닉네임 규칙', () => {
    expect(Math.round(toKg(225, 'lb'))).toBe(102);
    expect(formatWeight(100, 'kg')).toBe('100kg');
    expect(validateNickname('근용')).toBeNull();
    expect(validateNickname('a')).not.toBeNull();
    expect(validateNickname('공백 있음')).not.toBeNull();
  });
});

describe('plan', () => {
  it('요일: 월=0 … 일=6', () => {
    expect(weekdayOf(new Date('2026-11-16T12:00:00'))).toBe(0); // 월
    expect(weekdayOf(new Date('2026-11-22T12:00:00'))).toBe(6); // 일
    expect(parseWeekday('wed')).toBe(2);
    expect(parseWeekday(5)).toBe(5);
    expect(parseWeekday('x')).toBeNull();
  });

  it('계획 항목 검증', () => {
    expect(validatePlanItem({ exerciseId: 'a', sets: 3, reps: 10, weightKg: 60 })).toBeNull();
    expect(validatePlanItem({ exerciseId: 'a', sets: 0, reps: 10 })).not.toBeNull();
    expect(validatePlanItem({ exerciseId: 'a', sets: 3, reps: 10, weightKg: 600 })).not.toBeNull();
  });

  it('계획으로 세션 생성: 세트 수·무게·횟수 반영', () => {
    let n = 0;
    const s = sessionFromPlan(
      { title: '가슴', source: 'user', updatedAt: '', items: [{ exerciseId: 'bench-press', sets: 3, reps: 8, weightKg: 80 }] },
      0,
      () => `id${n++}`,
    );
    expect(s.planDay).toBe(0);
    expect(s.exercises[0].sets).toHaveLength(3);
    expect(s.exercises[0].sets[0]).toMatchObject({ weight: 80, reps: 8 });
  });

  it('하단 버튼: 세트 완료 → 마지막 세트면 다음 운동 → 마지막 운동이면 운동 완료', () => {
    const mk = (done: boolean[]) => ({
      id: 'e',
      exerciseId: 'x',
      sets: done.map((d, i) => ({ id: `s${i}`, kind: 'normal' as const, weight: 0, reps: 1, completedAt: d ? 't' : undefined })),
    });
    const s: Session = { id: 's', startedAt: '', updatedAt: '', exercises: [mk([true, false, false]), mk([false, false])] };
    expect(footerAction(s, 0)).toBe('complete_set');
    expect(currentSetIndex(s.exercises[0])).toBe(1);
    s.exercises[0] = mk([true, true, false]);
    expect(footerAction(s, 0)).toBe('next_exercise');
    expect(footerAction(s, 1)).toBe('complete_set');
    s.exercises[1] = mk([true, false]);
    expect(footerAction(s, 1)).toBe('finish');
  });
});
