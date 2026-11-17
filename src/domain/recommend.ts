// 규칙 기반 기본 루틴 추천 (정의서 7장 결정: 앱 내 추천은 규칙 기반)
// 목표 → 세트·횟수, 주 횟수 → 분할, 장비 → 운동 선택.
import type { Equipment, Exercise, Goal, Level, Profile, Routine, RoutineItem } from './types';

type Slot = { parts: Exercise['bodyParts'][number][]; compound: boolean };

const SCHEME: Record<Goal, { sets: number; reps: number }> = {
  strength: { sets: 5, reps: 5 },
  muscle: { sets: 4, reps: 10 },
  fat_loss: { sets: 3, reps: 12 },
  health: { sets: 3, reps: 12 },
};

const LEVEL_SET_ADJ: Record<Level, number> = { beginner: -1, intermediate: 0, advanced: 1 };

/** 분할 이름과 각 날의 운동 슬롯 */
export function splitFor(weeklyFreq: number): { name: string; slots: Slot[] }[] {
  const FULL: Slot[] = [
    { parts: ['quads'], compound: true },
    { parts: ['chest'], compound: true },
    { parts: ['back'], compound: true },
    { parts: ['shoulders'], compound: false },
    { parts: ['core'], compound: false },
  ];
  if (weeklyFreq <= 3) return [{ name: '전신', slots: FULL }];
  if (weeklyFreq === 4) {
    return [
      {
        name: '상체',
        slots: [
          { parts: ['chest'], compound: true },
          { parts: ['back'], compound: true },
          { parts: ['shoulders'], compound: true },
          { parts: ['biceps'], compound: false },
          { parts: ['triceps'], compound: false },
        ],
      },
      {
        name: '하체',
        slots: [
          { parts: ['quads'], compound: true },
          { parts: ['hamstrings'], compound: true },
          { parts: ['glutes'], compound: false },
          { parts: ['calves'], compound: false },
          { parts: ['core'], compound: false },
        ],
      },
    ];
  }
  return [
    {
      name: '밀기 (가슴·어깨·삼두)',
      slots: [
        { parts: ['chest'], compound: true },
        { parts: ['shoulders'], compound: true },
        { parts: ['chest'], compound: false },
        { parts: ['shoulders'], compound: false },
        { parts: ['triceps'], compound: false },
      ],
    },
    {
      name: '당기기 (등·이두)',
      slots: [
        { parts: ['back'], compound: true },
        { parts: ['back'], compound: true },
        { parts: ['shoulders'], compound: false },
        { parts: ['biceps'], compound: false },
        { parts: ['biceps'], compound: false },
      ],
    },
    {
      name: '하체',
      slots: [
        { parts: ['quads'], compound: true },
        { parts: ['hamstrings'], compound: true },
        { parts: ['quads'], compound: false },
        { parts: ['glutes'], compound: false },
        { parts: ['calves'], compound: false },
      ],
    },
  ];
}

function pickExercise(
  slot: Slot,
  pool: Exercise[],
  equipment: Equipment[],
  used: Set<string>,
): Exercise | undefined {
  const allowed = new Set<Equipment>([...equipment, 'bodyweight']);
  const candidates = pool.filter(
    (e) =>
      e.type !== 'cardio' &&
      allowed.has(e.equipment) &&
      !used.has(e.id) &&
      e.bodyParts[0] === slot.parts[0],
  );
  // 복합 운동 슬롯: 관여 부위가 많은 운동 우선. 고립 슬롯: 관여 부위가 적은 운동 우선
  candidates.sort((a, b) =>
    slot.compound ? b.bodyParts.length - a.bodyParts.length : a.bodyParts.length - b.bodyParts.length,
  );
  return candidates[0];
}

export function recommendRoutines(
  profile: Pick<Profile, 'goal' | 'level' | 'weeklyFreq' | 'equipment'>,
  pool: Exercise[],
  now = new Date(),
  makeId: () => string = () => Math.random().toString(36).slice(2),
): Routine[] {
  const scheme = SCHEME[profile.goal];
  const sets = Math.max(2, scheme.sets + LEVEL_SET_ADJ[profile.level]);
  const iso = now.toISOString();
  return splitFor(profile.weeklyFreq).map((day) => {
    const used = new Set<string>();
    const items: RoutineItem[] = [];
    for (const slot of day.slots) {
      const ex = pickExercise(slot, pool, profile.equipment, used);
      if (!ex) continue;
      used.add(ex.id);
      items.push({
        exerciseId: ex.id,
        targetSets: slot.compound ? sets : Math.max(2, sets - 1),
        targetReps: ex.id === 'plank' ? 1 : slot.compound ? scheme.reps : scheme.reps + 2,
      });
    }
    return {
      id: makeId(),
      name: day.name,
      source: 'template',
      status: 'active',
      items,
      createdAt: iso,
      updatedAt: iso,
    } satisfies Routine;
  });
}
