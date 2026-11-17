// deno test supabase/functions/mcp/lib.test.ts
import { assertEquals } from 'jsr:@std/assert@1';

import { e1rm, recovery, summarizeSession, volume, type DbSession } from './lib.ts';

const names = new Map([['bench-press', { id: 'bench-press', name_ko: '벤치 프레스', body_parts: ['chest', 'triceps'] }]]);
const session: DbSession = {
  id: 's1',
  routine_id: null,
  started_at: '2026-11-16T10:00:00Z',
  ended_at: '2026-11-16T11:00:00Z',
  memo: null,
  exercises: [
    {
      id: 'e1',
      exerciseId: 'bench-press',
      sets: [
        { id: 'a', kind: 'warmup', weight: 40, reps: 10, completedAt: 'x' },
        { id: 'b', kind: 'normal', weight: 100, reps: 5, completedAt: 'x' },
      ],
    },
  ],
};

Deno.test('볼륨은 웜업 제외', () => assertEquals(volume(session.exercises[0].sets), 500));
Deno.test('Epley', () => assertEquals(e1rm(100, 5), 116.7));
Deno.test('요약에 이름·시간 포함', () => {
  const s = summarizeSession(session, names);
  assertEquals(s.duration_min, 60);
  assertEquals(s.exercises[0].name, '벤치 프레스');
});
Deno.test('회복도 36시간 = 50%', () => {
  const r = recovery([session], names, Date.parse('2026-11-17T23:00:00Z'));
  assertEquals(r.find((x) => x.body_part === 'chest')?.recovery_pct, 50);
});
