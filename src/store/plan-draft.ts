// 계획 페이지에서 편집 중인 초안 (저장 전까지 주간 계획에 반영하지 않는다)
import { create } from 'zustand';

import type { PlanItem, Weekday } from '@/domain/types';

interface DraftState {
  day: Weekday | null;
  title: string;
  items: PlanItem[];
  load: (day: Weekday, title: string, items: PlanItem[]) => void;
  setTitle: (t: string) => void;
  add: (exerciseId: string, init?: Partial<PlanItem>) => void;
  update: (index: number, patch: Partial<PlanItem>) => void;
  remove: (index: number) => void;
  move: (index: number, delta: -1 | 1) => void;
}

export const usePlanDraft = create<DraftState>((set) => ({
  day: null,
  title: '',
  items: [],
  load: (day, title, items) => set({ day, title, items: items.map((i) => ({ ...i })) }),
  setTitle: (title) => set({ title }),
  add: (exerciseId, init) => set((s) => ({ items: [...s.items, { exerciseId, sets: 3, reps: 10, weightKg: 0, ...init }] })),
  update: (index, patch) => set((s) => ({ items: s.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) })),
  remove: (index) => set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
  move: (index, delta) =>
    set((s) => {
      const j = index + delta;
      if (j < 0 || j >= s.items.length) return s;
      const items = [...s.items];
      [items[index], items[j]] = [items[j], items[index]];
      return { items };
    }),
}));
