// 운동앱 MCP 서버 (Supabase Edge Function)
// - Claude는 Supabase Auth(OAuth 2.1)로 로그인한 사용자 토큰으로 호출한다.
// - 모든 조회는 사용자 권한 클라이언트로 하므로 RLS가 "본인 데이터만" 보장한다.
// - 정책(정의서 5.5): 쓰기는 루틴 "제안"과 세션 메모뿐, 기존 기록 수정·삭제 불가.
//   실명·이메일·연락처는 응답에 넣지 않는다. 기본 조회 기간 12주. 모든 호출은 감사 로그에 남긴다.
import { McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@^4.3.6';

import { type DbSession, type ExerciseInfo, e1rm, recovery, summarizeSession, weeksAgoIso } from './lib.ts';

type Text = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (v: unknown): Text => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
const fail = (msg: string): Text => ({ content: [{ type: 'text', text: msg }], isError: true });

const DISCLAIMER = '참고: 제안은 참고용이며 의료 조언이 아니다. 통증·부상 메모가 있으면 해당 부위 운동을 빼거나 사용자에게 먼저 물어볼 것.';

/** 호출 제한 확인 → 실행 → 감사 로그 기록 */
async function audited(
  db: SupabaseClient,
  tool: string,
  isWrite: boolean,
  run: () => Promise<Text>,
): Promise<Text> {
  const gate = await db.rpc('mcp_begin_call', { p_tool: tool, p_is_write: isWrite });
  if (gate.error) {
    const limited = gate.error.message.includes('rate_limited');
    return fail(limited ? gate.error.message.replace('rate_limited: ', '') : `요청을 처리할 수 없어요: ${gate.error.message}`);
  }
  let result: Text;
  try {
    result = await run();
  } catch (e) {
    result = fail(e instanceof Error ? e.message : String(e));
  }
  await db.from('mcp_audit_log').insert({
    tool,
    is_write: isWrite,
    ok: !result.isError,
    detail: result.isError ? result.content[0]?.text.slice(0, 300) : null,
  });
  return result;
}

async function exerciseNames(db: SupabaseClient): Promise<Map<string, ExerciseInfo>> {
  const [lib, custom] = await Promise.all([
    db.from('exercise_library').select('id, name_ko, body_parts'),
    db.from('custom_exercises').select('id, name_ko, body_parts'),
  ]);
  const map = new Map<string, ExerciseInfo>();
  for (const r of [...(lib.data ?? []), ...(custom.data ?? [])]) map.set(r.id, r as ExerciseInfo);
  return map;
}

async function finishedSessions(db: SupabaseClient, fromIso: string, toIso?: string, limit = 60): Promise<DbSession[]> {
  let q = db
    .from('sessions')
    .select('id, routine_id, started_at, ended_at, memo, exercises')
    .not('ended_at', 'is', null)
    .gte('started_at', fromIso)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (toIso) q = q.lte('started_at', toIso);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as DbSession[];
}

export function buildServer(db: SupabaseClient): McpServer {
  const server = new McpServer({ name: 'workout-app', version: '0.1.0' });

  server.registerTool(
    'get_profile',
    {
      title: '프로필 요약',
      description: '사용자의 운동 목표, 경력, 주간 운동 횟수, 쓸 수 있는 장비, 단위, 기본 휴식 시간을 돌려준다. 루틴을 짜기 전에 먼저 호출할 것.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      audited(db, 'get_profile', false, async () => {
        const { data, error } = await db
          .from('profiles')
          .select('nickname, goal, level, weekly_freq, equipment, unit, default_rest_sec, consent_body, height_cm, weight_kg')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return fail('프로필이 없어요. 앱에서 온보딩을 마쳐야 해요.');
        const { consent_body, height_cm, weight_kg, ...rest } = data;
        return ok({ ...rest, ...(consent_body ? { height_cm, weight_kg } : {}), weights_are_stored_in: 'kg', note: DISCLAIMER });
      }),
  );

  server.registerTool(
    'list_sessions',
    {
      title: '운동 기록 조회',
      description: '완료된 운동 세션을 최신순으로 돌려준다. 기본은 최근 12주. 무게 단위는 항상 kg. 웜업 세트는 볼륨에서 빠진다.',
      inputSchema: z.object({
        from: z.string().datetime().optional().describe('ISO 시작 시각. 없으면 12주 전'),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(60).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ from, to, limit }) =>
      audited(db, 'list_sessions', false, async () => {
        const [sessions, names] = await Promise.all([finishedSessions(db, from ?? weeksAgoIso(12), to, limit), exerciseNames(db)]);
        return ok({ count: sessions.length, sessions: sessions.map((s) => summarizeSession(s, names)) });
      }),
  );

  server.registerTool(
    'get_exercise_history',
    {
      title: '운동별 기록 추이',
      description: '한 운동의 세션별 최고 무게, 추정 1RM(Epley, 10회 이하), 볼륨 추이와 개인 기록(PR)을 돌려준다. 증량 여부를 판단할 때 쓴다.',
      inputSchema: z.object({
        exercise_id: z.string().describe('search_exercises로 찾은 운동 id'),
        weeks: z.number().int().min(1).max(52).default(12),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ exercise_id, weeks }) =>
      audited(db, 'get_exercise_history', false, async () => {
        const [sessions, prs] = await Promise.all([
          finishedSessions(db, weeksAgoIso(weeks), undefined, 60),
          db.from('personal_records').select('type, value, achieved_at').eq('exercise_id', exercise_id),
        ]);
        const points = sessions
          .map((s) => {
            const sets = s.exercises.filter((e) => e.exerciseId === exercise_id).flatMap((e) => e.sets);
            const work = sets.filter((x) => x.completedAt && x.kind !== 'warmup');
            if (!work.length) return null;
            return {
              date: s.started_at,
              best_weight_kg: Math.max(...work.map((x) => x.weight)),
              best_e1rm_kg: Math.max(0, ...work.map((x) => e1rm(x.weight, x.reps) ?? 0)) || null,
              volume_kg: work.reduce((a, x) => a + x.weight * x.reps, 0),
              sets: work.map((x) => `${x.weight}kg×${x.reps}${x.rpe ? `@${x.rpe}` : ''}`),
            };
          })
          .filter(Boolean)
          .reverse();
        return ok({ exercise_id, sessions: points, personal_records: prs.data ?? [] });
      }),
  );

  server.registerTool(
    'get_recovery_status',
    {
      title: '부위별 회복 상태',
      description: '부위별로 마지막 운동 후 경과 시간과 단순 회복도(72시간=100%)를 돌려준다. 오늘 어떤 부위를 할지 정할 때 쓴다.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      audited(db, 'get_recovery_status', false, async () => {
        const [sessions, names] = await Promise.all([finishedSessions(db, weeksAgoIso(2)), exerciseNames(db)]);
        return ok({ body_parts: recovery(sessions, names), note: '기록이 없는 부위는 목록에 없으며 회복된 것으로 본다.' });
      }),
  );

  server.registerTool(
    'search_exercises',
    {
      title: '운동 검색',
      description: '운동 라이브러리와 사용자 커스텀 운동에서 이름(한글/영문)이나 부위로 검색한다. 루틴 제안 전에 exercise_id를 얻을 때 쓴다.',
      inputSchema: z.object({
        query: z.string().max(40).optional(),
        body_part: z
          .enum(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio'])
          .optional(),
        equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band']).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, body_part, equipment }) =>
      audited(db, 'search_exercises', false, async () => {
        const run = async (table: 'exercise_library' | 'custom_exercises') => {
          let q = db.from(table).select('id, name_ko, name_en, body_parts, equipment, type').limit(30);
          if (query) q = q.or(`name_ko.ilike.%${query.replace(/[%,()]/g, '')}%,name_en.ilike.%${query.replace(/[%,()]/g, '')}%`);
          if (body_part) q = q.contains('body_parts', [body_part]);
          if (equipment) q = q.eq('equipment', equipment);
          const { data, error } = await q;
          if (error) throw new Error(error.message);
          return (data ?? []).map((r) => ({ ...r, custom: table === 'custom_exercises' }));
        };
        const [a, b] = await Promise.all([run('exercise_library'), run('custom_exercises')]);
        return ok([...b, ...a]);
      }),
  );

  server.registerTool(
    'list_routines',
    {
      title: '루틴 목록',
      description: '사용자의 루틴을 돌려준다. status: active(사용 중), proposed(Claude 제안·승인 대기), archived.',
      inputSchema: z.object({ status: z.enum(['active', 'proposed', 'archived']).optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ status }) =>
      audited(db, 'list_routines', false, async () => {
        let q = db.from('routines').select('id, name, source, status, items, note, updated_at').order('updated_at', { ascending: false });
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok(data);
      }),
  );

  server.registerTool(
    'propose_routine',
    {
      title: '루틴 제안',
      description:
        '새 루틴을 "제안" 상태로 보낸다. 사용자가 앱에서 승인해야 실제 루틴이 된다. 기존 루틴이나 기록은 바꾸지 않는다. exercise_id는 search_exercises 결과만 쓸 것. 무게는 kg.',
      inputSchema: z.object({
        name: z.string().min(1).max(40),
        note: z.string().max(500).optional().describe('왜 이렇게 구성했는지 사용자에게 보여줄 짧은 설명'),
        items: z
          .array(
            z.object({
              exercise_id: z.string(),
              sets: z.number().int().min(1).max(10),
              reps: z.number().int().min(1).max(50),
              weight_kg: z.number().min(0).max(500).optional(),
              rest_sec: z.number().int().min(10).max(600).optional(),
            }),
          )
          .min(1)
          .max(15),
      }),
    },
    ({ name, note, items }) =>
      audited(db, 'propose_routine', true, async () => {
        const names = await exerciseNames(db);
        const unknown = items.filter((i) => !names.has(i.exercise_id)).map((i) => i.exercise_id);
        if (unknown.length) return fail(`없는 운동 id: ${unknown.join(', ')}. search_exercises로 먼저 찾아 주세요.`);
        const { data, error } = await db
          .from('routines')
          .insert({
            name,
            note: note ?? null,
            source: 'claude',
            status: 'proposed',
            items: items.map((i) => ({
              exerciseId: i.exercise_id,
              targetSets: i.sets,
              targetReps: i.reps,
              ...(i.weight_kg != null ? { targetWeight: i.weight_kg } : {}),
              ...(i.rest_sec != null ? { restSec: i.rest_sec } : {}),
            })),
          })
          .select('id, name, status')
          .single();
        if (error) throw new Error(error.message);
        return ok({ ...data, message: '제안을 보냈어요. 사용자가 앱의 루틴 탭 > Claude 제안함에서 승인하면 적용돼요.' });
      }),
  );

  server.registerTool(
    'add_session_note',
    {
      title: '세션 메모 추가',
      description: '완료된 세션 메모 끝에 Claude 코멘트를 덧붙인다. 기존 메모는 지우지 않는다. 세트 기록은 바꿀 수 없다.',
      inputSchema: z.object({ session_id: z.string().uuid(), text: z.string().min(1).max(300) }),
    },
    ({ session_id, text }) =>
      audited(db, 'add_session_note', true, async () => {
        const { data: s, error } = await db.from('sessions').select('memo, updated_at').eq('id', session_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!s) return fail('세션을 찾을 수 없어요');
        const memo = [s.memo, `[Claude] ${text}`].filter(Boolean).join('\n').slice(0, 1000);
        // updated_at을 갱신해야 앱 동기화(LWW)에서 이 변경이 내려간다
        const up = await db.from('sessions').update({ memo, updated_at: new Date().toISOString() }).eq('id', session_id);
        if (up.error) throw new Error(up.error.message);
        return ok({ session_id, memo });
      }),
  );

  return server;
}
