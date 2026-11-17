// Claude가 쓰는 MCP 도구 (요구사항 12): 운동 계획 작성·수정·조회, 운동 기록 조회
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { EXERCISES } from '../src/data/exercises';
import { exerciseVolume, sessionDurationSec, sessionVolume } from '../src/domain/calc';
import { parseWeekday, validatePlanItem, WEEKDAY_EN, WEEKDAY_KO } from '../src/domain/plan';
import type { DayPlan, Exercise, PlanItem, Session, Weekday } from '../src/domain/types';
import type { DeviceData, Store } from './store';

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (v: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] });
const fail = (msg: string): Result => ({ content: [{ type: 'text', text: msg }], isError: true });

const DISCLAIMER = '계획은 참고용이며 의료 조언이 아니다. 세션 메모에 통증·부상이 있으면 해당 부위를 빼거나 사용자에게 먼저 물어볼 것.';

const dayEnum = z.enum(WEEKDAY_EN).describe('요일: mon, tue, wed, thu, fri, sat, sun');
const itemSchema = z.object({
  exercise_id: z.string().describe('search_exercises로 찾은 운동 id'),
  sets: z.number().int().min(1).max(30),
  reps: z.number().int().min(1).max(100),
  weight_kg: z.number().min(0).max(500).optional(),
  rest_sec: z.number().int().min(10).max(600).optional(),
});

function library(d: DeviceData | null): Exercise[] {
  // 앱의 커스텀 운동은 기록에서만 보이므로 라이브러리 + 기록에 나온 id
  return EXERCISES.concat(
    [...new Set(d?.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)) ?? [])]
      .filter((id) => !EXERCISES.some((e) => e.id === id))
      .map((id) => ({ id, nameKo: '커스텀 운동', nameEn: 'Custom', bodyParts: [], equipment: 'bodyweight', type: 'weighted', isCustom: true }) as Exercise),
  );
}

const nameOf = (lib: Exercise[], id: string) => lib.find((e) => e.id === id)?.nameKo ?? id;

function dayView(lib: Exercise[], day: Weekday, p: DayPlan | undefined) {
  return {
    day: WEEKDAY_EN[day],
    day_ko: `${WEEKDAY_KO[day]}요일`,
    rest_day: !p,
    ...(p
      ? {
          title: p.title ?? null,
          note: p.note ?? null,
          source: p.source,
          updated_at: p.updatedAt,
          items: p.items.map((i) => ({
            exercise_id: i.exerciseId,
            name: nameOf(lib, i.exerciseId),
            sets: i.sets,
            reps: i.reps,
            weight_kg: i.weightKg ?? null,
            rest_sec: i.restSec ?? null,
          })),
        }
      : {}),
  };
}

function recordSummary(lib: Exercise[], s: Session) {
  return {
    id: s.id,
    date: s.startedAt,
    day: s.planDay != null ? WEEKDAY_EN[s.planDay] : null,
    title: s.title ?? null,
    duration_min: Math.round(sessionDurationSec(s) / 60),
    total_volume_kg: sessionVolume(s),
    memo: s.memo ?? null,
    exercises: s.exercises.map((e) => ({
      exercise_id: e.exerciseId,
      name: nameOf(lib, e.exerciseId),
      volume_kg: exerciseVolume(e.sets),
      sets: e.sets.map((x) => `${x.kind === 'warmup' ? '웜업 ' : ''}${x.weight ? `${x.weight}kg×` : ''}${x.reps}${x.rpe ? `@${x.rpe}` : ''}`),
    })),
  };
}

function toItems(lib: Exercise[], items: z.infer<typeof itemSchema>[]): PlanItem[] | string {
  const unknown = items.filter((i) => !lib.some((e) => e.id === i.exercise_id)).map((i) => i.exercise_id);
  if (unknown.length) return `없는 운동 id: ${unknown.join(', ')}. search_exercises로 먼저 찾아 주세요.`;
  const out = items.map((i) => ({ exerciseId: i.exercise_id, sets: i.sets, reps: i.reps, weightKg: i.weight_kg, restSec: i.rest_sec }));
  const bad = out.map(validatePlanItem).find(Boolean);
  return bad ?? out;
}

export function buildMcpServer(store: Store): McpServer {
  const server = new McpServer({ name: 'personal-training', version: '0.2.0' });

  /** 대상 사용자 데이터를 읽고, 호출을 기록한다 */
  const run = async (tool: string, fn: (d: DeviceData, save: (d: DeviceData) => void) => Result | Promise<Result>) => {
    const id = store.activeId();
    const d = id ? store.load(id) : null;
    if (!id || !d) return fail('아직 앱과 동기화된 기기가 없어요. 앱 설정에서 동기화 서버 주소를 입력해 주세요.');
    let res: Result;
    try {
      res = await fn(d, (next) => store.save(next));
    } catch (e) {
      res = fail(e instanceof Error ? e.message : String(e));
    }
    store.recordCall(id, tool, !res.isError);
    return res;
  };

  const writePlan = (d: DeviceData, day: Weekday, plan: DayPlan | null) => {
    const now = new Date().toISOString();
    const days = { ...d.plan.days };
    if (plan) days[day] = { ...plan, source: 'claude', updatedAt: now };
    else delete days[day];
    d.plan = { days, updatedAt: now };
  };

  // ---------- 조회 ----------
  server.registerTool(
    'get_weekly_plan',
    {
      title: '주간 운동 계획 조회',
      description: '월~일 요일별 운동 계획을 돌려준다. 계획이 없는 요일은 휴식일(rest_day: true). 계획을 고치기 전에 먼저 호출할 것.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      run('get_weekly_plan', (d) => {
        const lib = library(d);
        return ok({
          nickname: d.user.nickname,
          updated_at: d.plan.updatedAt,
          days: ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((w) => dayView(lib, w, d.plan.days[w])),
          note: DISCLAIMER,
        });
      }),
  );

  server.registerTool(
    'list_workout_records',
    {
      title: '운동 기록 조회',
      description: '완료한 운동 기록을 최신순으로 돌려준다(무게 kg, 웜업은 볼륨 제외). exercise_id를 주면 그 운동이 들어간 기록만.',
      inputSchema: z.object({
        from: z.string().optional().describe('ISO 날짜. 이 날짜 이후 기록만'),
        to: z.string().optional(),
        exercise_id: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ from, to, exercise_id, limit }) =>
      run('list_workout_records', (d) => {
        const lib = library(d);
        const rows = d.sessions
          .filter((s) => !!s.endedAt)
          .filter((s) => (!from || s.startedAt >= from) && (!to || s.startedAt <= to))
          .filter((s) => !exercise_id || s.exercises.some((e) => e.exerciseId === exercise_id))
          .slice(0, limit)
          .map((s) => recordSummary(lib, s));
        return ok({ count: rows.length, total_records: d.sessions.length, records: rows });
      }),
  );

  server.registerTool(
    'search_exercises',
    {
      title: '운동 검색',
      description: '운동 라이브러리에서 이름(한글/영문)이나 부위로 운동 id를 찾는다. 계획을 쓰기 전에 사용.',
      inputSchema: z.object({
        query: z.string().max(40).optional(),
        body_part: z
          .enum(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio'])
          .optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, body_part }) =>
      run('search_exercises', (d) => {
        const q = query?.trim().toLowerCase();
        const hits = library(d).filter(
          (e) => (!body_part || e.bodyParts.includes(body_part)) && (!q || e.nameKo.includes(q) || e.nameEn.toLowerCase().includes(q) || e.id.includes(q)),
        );
        return ok(hits.slice(0, 40).map((e) => ({ id: e.id, name: e.nameKo, name_en: e.nameEn, body_parts: e.bodyParts, equipment: e.equipment })));
      }),
  );

  // ---------- 작성 ----------
  server.registerTool(
    'create_day_plan',
    {
      title: '운동 계획 작성',
      description: '한 요일의 운동 계획을 새로 만든다. 이미 계획이 있으면 overwrite: true일 때만 덮어쓴다. 앱에는 다음 동기화 때 반영되고 "Claude" 표시가 붙는다.',
      inputSchema: z.object({
        day: dayEnum,
        title: z.string().max(20).optional(),
        note: z.string().max(200).optional().describe('이렇게 짠 이유를 사용자에게 보여줄 짧은 설명'),
        items: z.array(itemSchema).min(1).max(15),
        overwrite: z.boolean().default(false),
      }),
    },
    ({ day, title, note, items, overwrite }) =>
      run('create_day_plan', (d, save) => {
        const w = parseWeekday(day)!;
        if (d.plan.days[w] && !overwrite) return fail(`${WEEKDAY_KO[w]}요일에 이미 계획이 있어요. 고치려면 update_day_plan, 덮어쓰려면 overwrite: true.`);
        const parsed = toItems(library(d), items);
        if (typeof parsed === 'string') return fail(parsed);
        writePlan(d, w, { title, note, items: parsed, source: 'claude', updatedAt: '' });
        save(d);
        return ok({ saved: dayView(library(d), w, d.plan.days[w]) });
      }),
  );

  // ---------- 수정 ----------
  server.registerTool(
    'update_day_plan',
    {
      title: '운동 계획 수정',
      description:
        '한 요일의 계획을 고친다. 항목 추가(add_items), 운동별 세트·횟수·무게 변경(update_items), 운동 빼기(remove_exercise_ids), 이름·메모 변경, 휴식일로 비우기(clear: true)를 한 번에 할 수 있다.',
      inputSchema: z.object({
        day: dayEnum,
        title: z.string().max(20).optional(),
        note: z.string().max(200).optional(),
        add_items: z.array(itemSchema).max(15).optional(),
        update_items: z
          .array(
            z.object({
              exercise_id: z.string(),
              sets: z.number().int().min(1).max(30).optional(),
              reps: z.number().int().min(1).max(100).optional(),
              weight_kg: z.number().min(0).max(500).optional(),
              rest_sec: z.number().int().min(10).max(600).optional(),
            }),
          )
          .optional(),
        remove_exercise_ids: z.array(z.string()).optional(),
        clear: z.boolean().optional().describe('true면 이 요일을 휴식일로 비운다'),
      }),
    },
    ({ day, title, note, add_items, update_items, remove_exercise_ids, clear }) =>
      run('update_day_plan', (d, save) => {
        const w = parseWeekday(day)!;
        const lib = library(d);
        if (clear) {
          writePlan(d, w, null);
          save(d);
          return ok({ saved: dayView(lib, w, undefined) });
        }
        const cur = d.plan.days[w];
        if (!cur) return fail(`${WEEKDAY_KO[w]}요일은 휴식일이에요. create_day_plan으로 먼저 만들어 주세요.`);
        let items = cur.items.filter((i) => !remove_exercise_ids?.includes(i.exerciseId));
        for (const u of update_items ?? []) {
          if (!items.some((i) => i.exerciseId === u.exercise_id)) return fail(`계획에 없는 운동: ${u.exercise_id}`);
          items = items.map((i) =>
            i.exerciseId === u.exercise_id
              ? { ...i, sets: u.sets ?? i.sets, reps: u.reps ?? i.reps, weightKg: u.weight_kg ?? i.weightKg, restSec: u.rest_sec ?? i.restSec }
              : i,
          );
        }
        if (add_items?.length) {
          const parsed = toItems(lib, add_items);
          if (typeof parsed === 'string') return fail(parsed);
          items = [...items, ...parsed];
        }
        const bad = items.map(validatePlanItem).find(Boolean);
        if (bad) return fail(bad);
        writePlan(d, w, items.length ? { ...cur, title: title ?? cur.title, note: note ?? cur.note, items } : null);
        save(d);
        return ok({ saved: dayView(lib, w, d.plan.days[w]) });
      }),
  );

  return server;
}
