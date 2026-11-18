// 실제 HTTP 서버를 띄워 앱 동기화 ↔ MCP(Claude) 흐름과 인증을 끝까지 확인한다
// 실행: npm run test:server
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { createApp } from './http';
import { Store } from './store';

const A = { id: '11111111-2222-4333-8444-555555555555', secret: 'a'.repeat(40) };
const B = { id: '99999999-2222-4333-8444-555555555555', secret: 'b'.repeat(40) };
let base = '';
let close: () => void;
let rpcId = 0;
let tokenA = '';

before(async () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'pt-')));
  const srv = createApp(store, { perMinute: 10_000 }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  close = () => srv.close();
});
after(() => close());

const userOf = (d: typeof A, nickname: string) => ({ id: d.id, nickname, createdAt: '2026-11-17T00:00:00.000Z' });
const emptyPlan = { days: {}, updatedAt: '1970-01-01T00:00:00.000Z' };

async function sync(d: typeof A, body: Record<string, unknown>, secret = d.secret) {
  const res = await fetch(`${base}/api/devices/${d.id}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ user: userOf(d, '근용'), plan: emptyPlan, sessions: [], deletedSessionIds: [], ...body }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };  
}

async function mcpRaw(path: string, method: string, params: unknown = {}, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const text = await res.text();
  const json = text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))!.slice(5));
  return { status: res.status, json };
}
const tool = async (token: string, name: string, args: unknown = {}) => {
  const r = await mcpRaw(`/mcp/${token}`, 'tools/call', { name, arguments: args });
  return { error: !!r.json.result?.isError, text: r.json.result?.content?.[0]?.text as string };
};

const session = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  planDay: 0,
  startedAt: '2026-11-16T10:00:00.000Z',
  endedAt: '2026-11-16T11:00:00.000Z',
  updatedAt: '2026-11-16T11:00:00.000Z',
  exercises: [{ id: 'e1', exerciseId: 'bench-press', sets: [{ id: 's1', kind: 'normal', weight: 80, reps: 8, completedAt: '2026-11-16T10:10:00.000Z' }] }],
};

test('비밀키 없이는 동기화 불가', async () => {
  const r = await sync(A, {}, '');
  assert.equal(r.status, 401);
});

test('첫 동기화에 기기 등록 + Claude 연결 토큰 발급', async () => {
  const r = await sync(A, {
    plan: { days: { 0: { items: [{ exerciseId: 'bench-press', sets: 3, reps: 8, weightKg: 80 }], source: 'user', updatedAt: '2026-11-16T09:00:00.000Z' } }, updatedAt: '2026-11-16T09:00:00.000Z' },
    sessions: [session],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.registered, true);
  assert.ok(r.body.mcpToken.length >= 24);
  tokenA = r.body.mcpToken;
});

test('다른 비밀키로 같은 기기 ID를 쓰면 거부 (남의 기록 탈취 방지)', async () => {
  const r = await sync(A, {}, 'x'.repeat(40));
  assert.equal(r.status, 401);
});

test('MCP: 토큰이 없거나 틀리면 401', async () => {
  assert.equal((await mcpRaw('/mcp', 'tools/list')).status, 401);
  assert.equal((await mcpRaw('/mcp/wrongtokenwrongtoken', 'tools/list')).status, 401);
});

test('MCP: 경로 토큰과 Bearer 헤더 둘 다 동작, 도구 5개', async () => {
  const a = await mcpRaw(`/mcp/${tokenA}`, 'tools/list');
  const b = await mcpRaw('/mcp', 'tools/list', {}, { authorization: `Bearer ${tokenA}` });
  assert.equal(a.status, 200);
  assert.deepEqual(
    a.json.result.tools.map((t: { name: string }) => t.name).sort(),
    ['create_day_plan', 'get_weekly_plan', 'list_workout_records', 'search_exercises', 'update_day_plan'],
  );
  assert.equal(b.json.result.tools.length, 5);
});

test('Claude가 기록 조회', async () => {
  const body = JSON.parse((await tool(tokenA, 'list_workout_records')).text);
  assert.equal(body.count, 1);
  assert.equal(body.records[0].exercises[0].name, '벤치 프레스');
  assert.equal(body.records[0].total_volume_kg, 640);
});

test('사용자 격리: B의 토큰으로는 A의 기록이 안 보인다', async () => {
  const rb = await sync(B, { user: userOf(B, '다른사람') });
  const tokenB = rb.body.mcpToken;
  assert.notEqual(tokenB, tokenA);
  assert.equal(JSON.parse((await tool(tokenB, 'list_workout_records')).text).count, 0);
  await tool(tokenB, 'create_day_plan', { day: 'fri', items: [{ exercise_id: 'pull-up', sets: 3, reps: 8 }] });
  assert.equal(JSON.parse((await tool(tokenA, 'get_weekly_plan')).text).days[4].rest_day, true);
});

test('Claude가 계획 작성·수정 → 앱 다음 동기화에 반영', async () => {
  assert.equal((await tool(tokenA, 'create_day_plan', { day: 'mon', items: [{ exercise_id: 'back-squat', sets: 5, reps: 5 }] })).error, true);
  assert.equal((await tool(tokenA, 'create_day_plan', { day: 'wed', items: [{ exercise_id: 'nope', sets: 3, reps: 5 }] })).error, true);
  assert.equal(
    (await tool(tokenA, 'create_day_plan', { day: 'wed', title: '하체', items: [{ exercise_id: 'back-squat', sets: 5, reps: 5, weight_kg: 100 }] })).error,
    false,
  );
  const updated = await tool(tokenA, 'update_day_plan', {
    day: 'mon',
    update_items: [{ exercise_id: 'bench-press', weight_kg: 82.5 }],
    add_items: [{ exercise_id: 'dips', sets: 3, reps: 10 }],
  });
  const mon = JSON.parse(updated.text).saved;
  assert.equal(mon.items[0].weight_kg, 82.5);
  assert.equal(mon.items.length, 2);

  const r = await sync(A, {});
  assert.equal(r.body.plan.days['2'].source, 'claude');
  assert.equal(r.body.mcp.connected, true);

  assert.equal((await tool(tokenA, 'update_day_plan', { day: 'wed', clear: true })).error, false);
  assert.equal(JSON.parse((await tool(tokenA, 'get_weekly_plan')).text).days[2].rest_day, true);
});

test('앱에서 지운 기록은 서버에서도 지워진다', async () => {
  await sync(A, { deletedSessionIds: [session.id] });
  assert.equal(JSON.parse((await tool(tokenA, 'list_workout_records')).text).count, 0);
});

test('Claude 연결 토큰 재발급: 예전 주소는 끊긴다', async () => {
  const res = await fetch(`${base}/api/devices/${A.id}/mcp-token`, { method: 'POST', headers: { authorization: `Bearer ${A.secret}` } });
  const { mcpToken } = (await res.json()) as { mcpToken: string };
  assert.notEqual(mcpToken, tokenA);
  assert.equal((await mcpRaw(`/mcp/${tokenA}`, 'tools/list')).status, 401);
  assert.equal((await mcpRaw(`/mcp/${mcpToken}`, 'tools/list')).status, 200);
  const st = (await (await fetch(`${base}/api/devices/${A.id}/status`, { headers: { authorization: `Bearer ${A.secret}` } })).json()) as {
    connected: boolean;
  };
  assert.equal(st.connected, false); // 새 토큰으로는 아직 Claude 호출 전
});

test('요청 제한', async () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'pt-rl-')));
  const srv = createApp(store, { perMinute: 3 }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const u = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/health`;
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(u)).status);
  srv.close();
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});
