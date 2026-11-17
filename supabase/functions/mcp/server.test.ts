// deno test supabase/functions/mcp/server.test.ts
// 가짜 DB로 MCP 프로토콜(initialize → tools/list → tools/call)이 실제로 도는지 확인한다.
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { createMcpHandler } from 'npm:@modelcontextprotocol/server@^2.0.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { buildServer } from './server.ts';

type Call = { table?: string; op: string; args?: unknown };

function fakeDb(opts: { rateLimited?: boolean } = {}) {
  const calls: Call[] = [];
  const tables: Record<string, unknown[]> = {
    profiles: [{ nickname: '근용', goal: 'muscle', level: 'intermediate', weekly_freq: 4, equipment: ['barbell'], unit: 'kg', default_rest_sec: 90, consent_body: false, height_cm: 180, weight_kg: 80 }],
    exercise_library: [{ id: 'bench-press', name_ko: '벤치 프레스', body_parts: ['chest'] }],
    custom_exercises: [],
    routines: [],
  };
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ['select', 'not', 'gte', 'lte', 'order', 'limit', 'eq', 'or', 'contains']) q[m] = chain;
    q.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
    q.single = async () => ({ data: { id: 'new-id', name: 'x', status: 'proposed' }, error: null });
    q.then = (res: (v: unknown) => unknown) => res({ data: tables[table] ?? [], error: null });
    q.insert = (row: unknown) => {
      calls.push({ table, op: 'insert', args: row });
      return q;
    };
    return q;
  };
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, args });
      return opts.rateLimited ? { error: { message: 'rate_limited: 분당 호출 한도(60회)를 넘었어요' } } : { error: null };
    },
    from: (t: string) => builder(t),
  };
  return { db: db as unknown as SupabaseClient, calls };
}

async function rpc(handler: { fetch: (r: Request) => Promise<Response> }, body: unknown) {
  const res = await handler.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  const json = text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))!.slice(5));
  return json;
}

const init = { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };

Deno.test('tools/list 에 8개 도구가 있고 읽기 도구는 readOnly', async () => {
  const { db } = fakeDb();
  const h = createMcpHandler(() => buildServer(db));
  await rpc(h, init);
  const res = await rpc(h, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const tools = res.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
  assertEquals(tools.map((t) => t.name).sort(), [
    'add_session_note', 'get_exercise_history', 'get_profile', 'get_recovery_status',
    'list_routines', 'list_sessions', 'propose_routine', 'search_exercises',
  ]);
  assert(tools.find((t) => t.name === 'get_profile')?.annotations?.readOnlyHint);
});

Deno.test('get_profile: 동의 없으면 키·체중을 숨기고 감사 로그를 남긴다', async () => {
  const { db, calls } = fakeDb();
  const h = createMcpHandler(() => buildServer(db));
  await rpc(h, init);
  const res = await rpc(h, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_profile', arguments: {} } });
  const body = JSON.parse(res.result.content[0].text);
  assertEquals(body.nickname, '근용');
  assertEquals(body.weight_kg, undefined);
  assert(calls.some((c) => c.op === 'rpc:mcp_begin_call'));
  assert(calls.some((c) => c.table === 'mcp_audit_log' && (c.args as { ok: boolean }).ok));
});

Deno.test('propose_routine: 없는 운동 id는 거부', async () => {
  const { db } = fakeDb();
  const h = createMcpHandler(() => buildServer(db));
  await rpc(h, init);
  const res = await rpc(h, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'propose_routine', arguments: { name: '테스트', items: [{ exercise_id: 'nope', sets: 3, reps: 10 }] } },
  });
  assert(res.result.isError);
});

Deno.test('호출 한도 초과 시 오류 메시지', async () => {
  const { db } = fakeDb({ rateLimited: true });
  const h = createMcpHandler(() => buildServer(db));
  await rpc(h, init);
  const res = await rpc(h, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_profile', arguments: {} } });
  assert(res.result.isError);
  assert(res.result.content[0].text.includes('한도'));
});
