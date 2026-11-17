// 실제 HTTP 서버를 띄워 앱 동기화 ↔ MCP(Claude) 흐름을 끝까지 확인한다
// 실행: npm run test:server
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { createApp } from './http';
import { Store } from './store';

const DEVICE = '11111111-2222-4333-8444-555555555555';
let base = '';
let close: () => void;
let rpcId = 0;

before(async () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'pt-')));
  const srv = createApp(store).listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  close = () => srv.close();
});
after(() => close());

async function mcp(method: string, params: unknown = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const text = await res.text();
  return text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))!.slice(5));
}
const tool = async (name: string, args: unknown = {}) => {
  const r = await mcp('tools/call', { name, arguments: args });
  return { error: !!r.result.isError, text: r.result.content[0].text as string };
};

const sync = async (body: Record<string, unknown>) => {
  const res = await fetch(`${base}/api/devices/${DEVICE}/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(res.status, 200);
  return res.json() as Promise<{ plan: { days: Record<string, { source: string; items: unknown[] }>; updatedAt: string }; mcp: { connected: boolean } }>;
};

const user = { id: DEVICE, nickname: '근용', createdAt: '2026-11-17T00:00:00.000Z' };
const session = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  planDay: 0,
  startedAt: '2026-11-16T10:00:00.000Z',
  endedAt: '2026-11-16T11:00:00.000Z',
  updatedAt: '2026-11-16T11:00:00.000Z',
  exercises: [{ id: 'e1', exerciseId: 'bench-press', sets: [{ id: 's1', kind: 'normal', weight: 80, reps: 8, completedAt: '2026-11-16T10:10:00.000Z' }] }],
};

test('동기화 전에는 MCP가 안내 메시지로 실패', async () => {
  await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const r = await tool('get_weekly_plan');
  assert.equal(r.error, true);
});

test('도구 목록: 계획 작성·수정·조회 + 기록 조회 + 운동 검색', async () => {
  const r = await mcp('tools/list');
  const names = r.result.tools.map((t: { name: string }) => t.name).sort();
  assert.deepEqual(names, ['create_day_plan', 'get_weekly_plan', 'list_workout_records', 'search_exercises', 'update_day_plan']);
});

test('앱 동기화 → Claude가 기록 조회', async () => {
  const res = await sync({
    user,
    plan: { days: { 0: { items: [{ exerciseId: 'bench-press', sets: 3, reps: 8, weightKg: 80 }], source: 'user', updatedAt: '2026-11-16T09:00:00.000Z' } }, updatedAt: '2026-11-16T09:00:00.000Z' },
    sessions: [session],
    deletedSessionIds: [],
  });
  assert.equal(res.mcp.connected, false);
  const r = await tool('list_workout_records');
  const body = JSON.parse(r.text);
  assert.equal(body.count, 1);
  assert.equal(body.records[0].exercises[0].name, '벤치 프레스');
  assert.equal(body.records[0].total_volume_kg, 640);
});

test('Claude가 계획 작성·수정 → 앱 다음 동기화에 반영', async () => {
  // 월요일은 이미 있음 → overwrite 없이는 실패
  assert.equal((await tool('create_day_plan', { day: 'mon', items: [{ exercise_id: 'back-squat', sets: 5, reps: 5 }] })).error, true);
  // 없는 운동 id 거부
  assert.equal((await tool('create_day_plan', { day: 'wed', items: [{ exercise_id: 'nope', sets: 3, reps: 5 }] })).error, true);

  const created = await tool('create_day_plan', {
    day: 'wed',
    title: '하체',
    note: '스쿼트 위주',
    items: [{ exercise_id: 'back-squat', sets: 5, reps: 5, weight_kg: 100 }],
  });
  assert.equal(created.error, false);

  const updated = await tool('update_day_plan', {
    day: 'mon',
    update_items: [{ exercise_id: 'bench-press', weight_kg: 82.5 }],
    add_items: [{ exercise_id: 'dips', sets: 3, reps: 10 }],
  });
  assert.equal(updated.error, false);
  const mon = JSON.parse(updated.text).saved;
  assert.equal(mon.items[0].weight_kg, 82.5);
  assert.equal(mon.items.length, 2);

  const plan = JSON.parse((await tool('get_weekly_plan')).text);
  assert.equal(plan.days[2].title, '하체');
  assert.equal(plan.days[1].rest_day, true);

  // 앱이 예전 계획으로 동기화해도 Claude가 고친 최신 계획이 내려간다
  const res = await sync({
    user,
    plan: { days: {}, updatedAt: '2026-11-16T09:00:00.000Z' },
    sessions: [],
    deletedSessionIds: [],
  });
  assert.equal(res.plan.days['2'].source, 'claude');
  assert.equal(res.mcp.connected, true);

  // 휴식일로 비우기
  assert.equal((await tool('update_day_plan', { day: 'wed', clear: true })).error, false);
  assert.equal(JSON.parse((await tool('get_weekly_plan')).text).days[2].rest_day, true);
});

test('앱에서 지운 기록은 서버에서도 지워진다', async () => {
  await sync({ user, plan: { days: {}, updatedAt: '1970-01-01T00:00:00.000Z' }, sessions: [], deletedSessionIds: [session.id] });
  assert.equal(JSON.parse((await tool('list_workout_records')).text).count, 0);
});

test('상태 API: 최근 MCP 호출 기록', async () => {
  const s = (await (await fetch(`${base}/api/devices/${DEVICE}/status`)).json()) as { connected: boolean; recentCalls: { tool: string }[] };
  assert.equal(s.connected, true);
  assert.ok(s.recentCalls.length > 0);
});
